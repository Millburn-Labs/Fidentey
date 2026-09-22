import { useCallback, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract, type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CostModel } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { compiledContract, type FidenteyCircuitId, type FidenteyContractInstance, type FidenteyPrivateState } from '../lib/contract';
import { createConnectorProviders } from '../lib/walletProvider';
import { CONTRACT_ADDRESS, INDEXER_URI, INDEXER_WS_URI, NETWORK_ID, PRIVATE_STATE_ID, ZK_CONFIG_BASE_URL } from '../lib/network';

export type ConnectStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RevealOutcome = 'too-low' | 'too-high' | 'correct';

function outcomeFromCode(code: bigint): RevealOutcome {
  if (code === 2n) return 'correct';
  if (code === 0n) return 'too-low';
  return 'too-high';
}

// Demo-only local-storage encryption password for the browser's private-state
// database (secret number lives only in IndexedDB on this device, encrypted
// at rest with this key). Mirrors the placeholder pattern already used by
// scripts/deploy.ts for the same provider. Not a wallet/funds secret.
const PRIVATE_STORAGE_PASSWORD = 'Fidentey-Local-Browser-Storage-Key!';

function makePrivateStateProvider(accountId: string) {
  const provider = levelPrivateStateProvider<typeof PRIVATE_STATE_ID, FidenteyPrivateState>({
    privateStateStoreName: 'fidentey-private-state',
    accountId,
    privateStoragePasswordProvider: () => PRIVATE_STORAGE_PASSWORD,
  });
  provider.setContractAddress(CONTRACT_ADDRESS);
  return provider;
}

export function useMidnight() {
  const [status, setStatus] = useState<ConnectStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<RevealOutcome | null>(null);

  const apiRef = useRef<ConnectedAPI | null>(null);
  const foundContractRef = useRef<FoundContract<FidenteyContractInstance> | null>(null);
  const accountIdRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      // Don't hardcode a single injection key ("mnLace") — different Lace
      // builds/versions have been seen to register under different keys.
      // Take whatever's actually there, preferring one that looks like Lace.
      const injectedWallets = window.midnight ?? {};
      const keys = Object.keys(injectedWallets);
      if (keys.length === 0) {
        throw new Error(
          'No Midnight wallet detected on window.midnight — install/enable the Lace wallet\'s Midnight support and refresh. ' +
            '(Regular Cardano Lace does not inject this; you need a build with Midnight support enabled.)',
        );
      }
      const preferredKey = keys.find((k) => k.toLowerCase().includes('lace')) ?? keys[0];
      const injected = injectedWallets[preferredKey];
      console.info(`[Fidentey] Using injected wallet "${preferredKey}" (found: ${keys.join(', ')})`);

      setNetworkId(NETWORK_ID);

      const api = await injected.connect(NETWORK_ID);
      const connStatus = await api.getConnectionStatus();
      if (connStatus.status !== 'connected' || connStatus.networkId !== NETWORK_ID) {
        throw new Error(
          `Wallet is on network "${connStatus.status === 'connected' ? connStatus.networkId : 'disconnected'}", ` +
            `but this dApp expects "${NETWORK_ID}". Switch networks in Lace and reconnect.`,
        );
      }
      apiRef.current = api;

      const { unshieldedAddress } = await api.getUnshieldedAddress();
      setAddress(unshieldedAddress);
      accountIdRef.current = unshieldedAddress;

      const { walletProvider, midnightProvider } = await createConnectorProviders(api);
      const zkConfigProvider = new FetchZkConfigProvider<FidenteyCircuitId>(ZK_CONFIG_BASE_URL);
      const proofProvider = await dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel());
      const privateStateProvider = makePrivateStateProvider(unshieldedAddress);
      if ((await privateStateProvider.get(PRIVATE_STATE_ID)) === null) {
        // Placeholder until the host enters their real secret via CircuitCall.
        // 0 never matches a real secretHash, so a player who hasn't entered the
        // host's secret simply can't produce a passing reveal proof — correct.
        await privateStateProvider.set(PRIVATE_STATE_ID, { secretNumber: 0n });
      }

      const found = await findDeployedContract(
        {
          privateStateProvider,
          publicDataProvider: indexerPublicDataProvider(INDEXER_URI, INDEXER_WS_URI),
          zkConfigProvider,
          proofProvider,
          walletProvider,
          midnightProvider,
        },
        {
          compiledContract,
          contractAddress: CONTRACT_ADDRESS,
          privateStateId: PRIVATE_STATE_ID,
        },
      );
      foundContractRef.current = found;

      setStatus('connected');
    } catch (e) {
      apiRef.current = null;
      foundContractRef.current = null;
      accountIdRef.current = null;
      setAddress(null);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to connect wallet.');
    }
  }, []);

  const disconnect = useCallback(() => {
    apiRef.current = null;
    foundContractRef.current = null;
    accountIdRef.current = null;
    setAddress(null);
    setStatus('disconnected');
    setError(null);
    setLastTxHash(null);
    setLastOutcome(null);
  }, []);

  const submitGuess = useCallback(async (guess: number) => {
    const found = foundContractRef.current;
    if (!found) throw new Error('Wallet not connected.');
    setBusy(true);
    setError(null);
    try {
      const result = await found.callTx.submitGuess(BigInt(guess));
      setLastTxHash(result.public.txHash);
      return result.public.txHash;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'submitGuess failed.');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  // Stores the host's secret number in local private state, then immediately
  // calls revealGuess() — which proves the pending guess is too-low/too-high/
  // correct against that secret WITHOUT the number itself ever being sent
  // anywhere. The caller must clear its own input field; this hook never
  // returns or logs the number it was given.
  const setSecretAndReveal = useCallback(async (secretNumber: number) => {
    const found = foundContractRef.current;
    const accountId = accountIdRef.current;
    if (!found || !accountId) throw new Error('Wallet not connected.');
    setBusy(true);
    setError(null);
    try {
      const privateStateProvider = makePrivateStateProvider(accountId);
      await privateStateProvider.set(PRIVATE_STATE_ID, { secretNumber: BigInt(secretNumber) });

      const result = await found.callTx.revealGuess();
      // The circuit's JS-typed return value is deliberately under `.private`
      // in midnight-js's types (it's derived from witness-fed proof inputs) —
      // it becomes public only once written to ledger state (`lastResult`).
      const outcome = outcomeFromCode(result.private.result);
      setLastTxHash(result.public.txHash);
      setLastOutcome(outcome);
      return outcome;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'revealGuess failed.');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    status,
    address,
    error,
    busy,
    lastTxHash,
    lastOutcome,
    connect,
    disconnect,
    submitGuess,
    setSecretAndReveal,
  };
}
