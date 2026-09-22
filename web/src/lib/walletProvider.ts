import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { WalletProvider, MidnightProvider } from '@midnight-ntwrk/midnight-js-types';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Buffer } from 'buffer';

// Bridges the DApp Connector's wire format (hex-encoded transaction strings,
// per the wallet's own balance/submit calls) to the object-typed
// WalletProvider/MidnightProvider interfaces midnight-js-contracts expects.
//
// NOTE: this bridge is the one piece of this integration we could not verify
// against a live wallet/network in this environment (no browser + Lace
// extension available here). The individual pieces are taken directly from
// the installed @midnight-ntwrk/dapp-connector-api@4.0.1 and
// @midnight-ntwrk/ledger-v8 type definitions, but please sanity-check this
// file against the current Midnight docs (or the midnight-docs MCP) before
// relying on it for your demo.
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));

export async function createConnectorProviders(
  api: ConnectedAPI,
): Promise<{ walletProvider: WalletProvider; midnightProvider: MidnightProvider }> {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
    async balanceTx(tx, ttl) {
      void ttl; // the connector negotiates its own TTL internally
      const { tx: balancedHex } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balancedHex));
    },
  };

  const midnightProvider: MidnightProvider = {
    async submitTx(tx) {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  return { walletProvider, midnightProvider };
}
