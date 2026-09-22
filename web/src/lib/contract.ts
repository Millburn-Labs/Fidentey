import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
// Plain JS/d.ts output from `compact compile` (npm run compile, at the repo root),
// copied into web/src/generated/fidentey — NOT imported from ../../../managed
// directly. That file's own `import type * as __compactRuntime from
// '@midnight-ntwrk/compact-runtime'` resolves by walking up from wherever the
// file physically lives; outside web/, that walk never reaches web/node_modules,
// so the import silently resolves to `any` and every type built on it
// (CircuitResults, CircuitReturnType, ...) collapses with it — no error, just
// wrong types, only caught by testing a genuinely clean install (no ancestor
// node_modules) instead of a machine with a leftover root-level `npm install`.
// Re-copy this after recompiling the contract: `npm run compile` at the repo
// root, then `cp managed/fidentey/contract/index.{js,js.map,d.ts} web/src/generated/fidentey/`.
import * as FidenteyContract from '../generated/fidentey/index.js';
import type { Contract as GeneratedContract, Ledger, Witnesses } from '../generated/fidentey/index';

/** Off-chain-only. Never written to the ledger — see witnesses.hostSecretNumber below. */
export type FidenteyPrivateState = {
  secretNumber: bigint;
};

export const witnesses: Witnesses<FidenteyPrivateState> = {
  hostSecretNumber({ privateState }: WitnessContext<Ledger, FidenteyPrivateState>): [FidenteyPrivateState, bigint] {
    return [privateState, privateState.secretNumber];
  },
};

// `Types.Ctor<C>` inference from a bare (unapplied) generic class reference
// collapses `C`'s provableCircuits keys to `string` instead of the literal
// 'submitGuess' | 'revealGuess' union — a sharp edge of compact-js's effect-based
// generics, not something specific to this contract. Pinning `C` explicitly via
// the generated declaration file (which *is* concretely keyed, independent of PS)
// keeps everything downstream (findDeployedContract, callTx.submitGuess/revealGuess)
// fully typed instead of falling back to `any`.
export type FidenteyContractInstance = GeneratedContract<FidenteyPrivateState>;
export type FidenteyCircuitId = keyof FidenteyContractInstance['provableCircuits'] & string;

export const compiledContract = CompiledContract.make<FidenteyContractInstance>(
  'fidentey',
  FidenteyContract.Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  // Not read from disk in the browser — the real ZK artifacts are fetched over
  // HTTP by the FetchZkConfigProvider configured in useMidnight.ts. This just
  // satisfies CompiledContract's type-level requirement for a compiled-assets tag.
  CompiledContract.withCompiledFileAssets('fidentey'),
);

export const pureCircuits = FidenteyContract.pureCircuits;
