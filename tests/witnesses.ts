import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, Witnesses } from '../managed/fidentey/contract/index.js';

/**
 * Local (off-chain) copy of everything the host needs to prove circuit
 * calls. None of this is ever written to the ledger in the clear — the
 * compiled circuits only ever see it inside a zero-knowledge proof.
 */
export type FidenteyPrivateState = {
  secretNumber: bigint;
};

export const witnesses: Witnesses<FidenteyPrivateState> = {
  hostSecretNumber({ privateState }: WitnessContext<Ledger, FidenteyPrivateState>): [FidenteyPrivateState, bigint] {
    return [privateState, privateState.secretNumber];
  },
};
