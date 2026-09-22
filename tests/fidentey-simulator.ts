import {
  type CircuitContext,
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../managed/fidentey/contract/index.js';
import { type FidenteyPrivateState, witnesses } from './witnesses.js';

const DUMMY_COIN_PUBLIC_KEY = '0'.repeat(64);

/**
 * Local testbed that runs the compiled Fidentey circuits against an
 * in-memory ledger — no network, no proof server, no wallet.
 */
export class FidenteySimulator {
  readonly contract: Contract<FidenteyPrivateState>;
  readonly contractAddress = sampleContractAddress();
  context!: CircuitContext<FidenteyPrivateState>;

  private constructor() {
    this.contract = new Contract<FidenteyPrivateState>(witnesses);
  }

  static deploy(privateState: FidenteyPrivateState, initialSecretHash: Uint8Array): FidenteySimulator {
    const sim = new FidenteySimulator();
    const { currentPrivateState, currentContractState } = sim.contract.initialState(
      createConstructorContext(privateState, DUMMY_COIN_PUBLIC_KEY),
      initialSecretHash,
    );
    sim.context = createCircuitContext(
      sim.contractAddress,
      DUMMY_COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
    return sim;
  }

  /** Swap the private state used for subsequent circuit calls (simulates a different caller). */
  actingAs(privateState: FidenteyPrivateState) {
    this.context.currentPrivateState = privateState;
    return this;
  }

  getLedger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  submitGuess(guess: bigint): Ledger {
    const { context } = this.contract.circuits.submitGuess(this.context, guess);
    this.context = context;
    return this.getLedger();
  }

  revealGuess(): { result: bigint; ledger: Ledger } {
    const { context, result } = this.contract.circuits.revealGuess(this.context);
    this.context = context;
    return { result, ledger: this.getLedger() };
  }
}
