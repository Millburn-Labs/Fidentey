import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, Witnesses } from '../managed/counter/contract/index.js';

/**
 * Local (off-chain) copy of everything a caller needs to prove circuit calls.
 * None of this is ever written to the ledger in the clear — the compiled
 * circuits only ever see it inside a zero-knowledge proof.
 */
export type CounterPrivateState = {
  pin: Uint8Array;
};

export const witnesses: Witnesses<CounterPrivateState> = {
  localSecretPin({ privateState }: WitnessContext<Ledger, CounterPrivateState>): [CounterPrivateState, Uint8Array] {
    return [privateState, privateState.pin];
  },
};
