/**
 * Deploy the private-counter contract to a Midnight network
 * (undeployed by default; use --network preview|preprod for public networks).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, recordDeployment } from './network.js';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { Agent, setGlobalDispatcher } from 'undici';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Node's global fetch (backed by undici) defaults to a 5-minute headers/body
// timeout. Proving a real circuit against a CPU-constrained local proof
// server can legitimately take longer than that — the server keeps working,
// but the client gives up and reports a generic "Transport error" even
// though nothing actually failed. Raise the ceiling well past any realistic
// proof time instead of that default.
setGlobalDispatcher(new Agent({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000, connectTimeout: 60_000 }));

const PRIVATE_STATE_ID = 'counterPrivateState';

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

// ─── Demo pin ────────────────────────────────────────────────────────────────
//
// The pin this contract is configured with at deploy time. Generated once
// and cached locally (gitignored) so re-running deploy or the CLI demo
// reuses the same pin instead of locking everyone out of the freshly
// deployed contract.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysPath = path.resolve(__dirname, '..', '.counter-keys.json');

interface DemoKeys {
  pin: string;
}

function loadOrCreateDemoKeys(): DemoKeys {
  if (fs.existsSync(keysPath)) {
    return JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  }
  const keys: DemoKeys = { pin: randomBytes(32).toString('hex') };
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
  console.log(`  Generated demo pin → ${path.basename(keysPath)} (gitignored)\n`);
  return keys;
}

// ─── Proof server readiness ─────────────────────────────────────────────────

async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(networkConfig.proofServer, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// ─── Compiled contract loading ──────────────────────────────────────────────

const zkConfigPath = path.resolve(__dirname, '..', 'managed', 'counter');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ Contract not compiled! Run: npm run compile\n');
  process.exit(1);
}

const CounterContract = await import(pathToFileURL(contractPath).href);

// The constructor never calls any witness, but the generated Contract class
// still validates that every declared witness has a function-valued
// implementation. This placeholder is never actually invoked at deploy
// time — the real value is supplied by callers when they later run
// increment or setPin (see tests/witnesses.ts for the real implementation).
const deployWitnesses = {
  localSecretPin: ({ privateState }: any) => [privateState, new Uint8Array(32)],
};

const compiledContract = CompiledContract.make('counter', CounterContract.Contract).pipe(
  CompiledContract.withWitnesses(deployWitnesses as any),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// ─── Providers ───────────────────────────────────────────────────────────────

async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'counter-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Deploy private-counter to ${network}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const demoKeys = loadOrCreateDemoKeys();
  const { pureCircuits } = CounterContract;
  const initialPinHash: Uint8Array = pureCircuits.hashPin(new Uint8Array(Buffer.from(demoKeys.pin, 'hex')));

  const seed = SEED;

  console.log('─── Wallet setup ───────────────────────────────────────────────\n');
  console.log('  Creating wallet...');
  const walletCtx = await createWallet({ network, networkConfig, seed });
  const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
  if (restoredCount > 0) {
    console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
  }

  console.log('  Syncing with network...');
  console.log('  ℹ  This may take several minutes depending on network size.');
  console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
  const syncStart = Date.now();
  const syncInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
  }, 5000);
  const state = await walletCtx.wallet.waitForSyncedState();
  clearInterval(syncInterval);
  process.stdout.write('\r  ✓ Synced with network.                                      \n');

  await persistWalletState(network, walletCtx);

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  let balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address: ${address}`);
  console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

  if (network === 'undeployed' && balance === 0n) {
    console.error('\n❌ Genesis-seed wallet has zero NIGHT.\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  if (network !== 'undeployed' && networkConfig.faucet) {
    const initialBalance = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
    const initialTNight = initialBalance.unshielded.balances[unshieldedToken().raw] ?? 0n;
    if (initialTNight === 0n) {
      console.log('─── Fund Wallet ────────────────────────────────────────────────\n');
      console.log(`  Wallet address: ${address}`);
      console.log(`  Faucet:         ${networkConfig.faucet}`);
      console.log('\n  Waiting for tNIGHT to arrive (poll every 10s)...');
      const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
      const start = Date.now();
      while (true) {
        await new Promise((r) => setTimeout(r, 10_000));
        const s = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)));
        const tn = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
        if (tn > 0n) {
          console.log(`\n  Funded! tNIGHT balance: ${tn.toLocaleString()}\n`);
          break;
        }
        if (Date.now() - start > timeoutMs) {
          console.log(`\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`);
          console.log(`  Address: ${address}\n  Faucet:  ${networkConfig.faucet}`);
          await walletCtx.wallet.stop();
          process.exit(1);
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
      }
    }
  }

  // ─── Register for DUST — wrapped in its own retry loop ────────────────────
  //
  // The public preview/preprod RPC nodes have been observed to drop the
  // websocket mid-subscription right as this extrinsic is submitted
  // (`disconnected ... 1000: Normal Closure`), even though the wallet's sync
  // connection on the same socket was stable moments earlier. This is a
  // transient infra issue, not a logic error — retry with backoff instead of
  // letting one flaky RPC round-trip kill the whole deploy.
  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');

  const DUST_REG_MAX_RETRIES = 5;
  const DUST_REG_RETRY_DELAY_MS = 8000;

  for (let attempt = 1; attempt <= DUST_REG_MAX_RETRIES; attempt++) {
    const dustState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
    const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
      (c: any) => !c.meta?.registeredForDustGeneration,
    );
    if (unregisteredUtxos.length === 0) break;

    console.log(`  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation (attempt ${attempt}/${DUST_REG_MAX_RETRIES})...`);
    try {
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        unregisteredUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
      await walletCtx.wallet.submitTransaction(finalized);
      break;
    } catch (err: any) {
      const msg = err?.message || err?.cause?.message || err?.toString() || '';
      console.log(`  ⚠ DUST registration attempt ${attempt} failed: ${msg}`);
      if (attempt === DUST_REG_MAX_RETRIES) {
        console.log('\n  ❌ DUST registration kept failing — likely a transient RPC issue. Re-run `npm run deploy`.\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, DUST_REG_RETRY_DELAY_MS));
    }
  }

  const dustReadyState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  if (dustReadyState.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  console.log('  DUST tokens ready!\n');

  // ─── Deploy ──────────────────────────────────────────────────────────────
  console.log('─── Deploy Contract ────────────────────────────────────────────\n');

  console.log('  Checking proof server...');
  const proofServerReady = await waitForProofServer();
  if (!proofServerReady) {
    console.log('\n  ❌ Proof server not responding. Run: docker run -p 6300:6300 midnightnetwork/proof-server\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  console.log('  Setting up providers...');
  const providers = await createProviders(walletCtx);

  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');

  console.log('  Deploying contract...\n');

  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [initialPinHash],
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });
      break;
    } catch (err: any) {
      const errMsg = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';
      const fullError = `${errMsg} ${errCause}`;

      const isDustShortage =
        fullError.includes('Not enough Dust') ||
        fullError.includes('Insufficient Funds') ||
        fullError.includes('could not balance dust');

      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${errMsg}`);
        if (errCause && errCause !== errMsg) console.error(`  Cause: ${errCause}`);
      }

      if (
        !isDustShortage &&
        (fullError.includes('Failed to connect to Proof Server') || fullError.includes('connect ECONNREFUSED 127.0.0.1:6300'))
      ) {
        console.log('  ❌ Proof server unreachable.\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }

      const isTransientRpc = fullError.includes('disconnected') || fullError.includes('SubmissionError');

      if (isDustShortage || isTransientRpc) {
        const currentState = await walletCtx.wallet.waitForSyncedState();
        const dustBalance = currentState.dust.balance(new Date());
        if (attempt < MAX_RETRIES) {
          console.log(`  ⏳ DUST balance: ${dustBalance.toLocaleString()} (attempt ${attempt}/${MAX_RETRIES}); retrying in ${RETRY_DELAY_MS / 1000}s...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          console.log(`  ❌ Deployment kept failing after ${MAX_RETRIES} retries.`);
          await walletCtx.wallet.stop();
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('  ✅ Contract deployed successfully!\n');
  console.log(`  Contract Address: ${contractAddress}\n`);

  recordDeployment(network, contractAddress, address.toString());
  console.log('  Saved to .midnight-state.json\n');

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
