import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  hostSecretNumber(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  submitGuess(context: __compactRuntime.CircuitContext<PS>, guess_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealGuess(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  submitGuess(context: __compactRuntime.CircuitContext<PS>, guess_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealGuess(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
  hashNumber(n_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  hashNumber(context: __compactRuntime.CircuitContext<PS>, n_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  submitGuess(context: __compactRuntime.CircuitContext<PS>, guess_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealGuess(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  readonly secretHash: Uint8Array;
  readonly pendingGuess: bigint;
  readonly attempts: bigint;
  readonly solved: boolean;
  readonly lastResult: bigint;
  readonly revealedNumber: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initialSecretHash_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
