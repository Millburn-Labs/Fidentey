import {
  type CircuitContext,
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../managed/counter/contract/index.js';
import { type CounterPrivateState, witnesses } from './witnesses.js';

const DUMMY_COIN_PUBLIC_KEY = '0'.repeat(64);

/**
 * Local testbed that runs the compiled counter circuits against an in-memory
 * ledger — no network, no proof server, no wallet.
 */
export class CounterSimulator {
  readonly contract: Contract<CounterPrivateState>;
  readonly contractAddress = sampleContractAddress();
  context!: CircuitContext<CounterPrivateState>;

  private constructor() {
    this.contract = new Contract<CounterPrivateState>(witnesses);
  }

  static deploy(privateState: CounterPrivateState, initialPinHash: Uint8Array): CounterSimulator {
    const sim = new CounterSimulator();
    const { currentPrivateState, currentContractState } = sim.contract.initialState(
      createConstructorContext(privateState, DUMMY_COIN_PUBLIC_KEY),
      initialPinHash,
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
  actingAs(privateState: CounterPrivateState) {
    this.context.currentPrivateState = privateState;
    return this;
  }

  getLedger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  increment(): Ledger {
    const { context } = this.contract.circuits.increment(this.context);
    this.context = context;
    return this.getLedger();
  }

  setPin(newPinHash: Uint8Array): Ledger {
    const { context } = this.contract.circuits.setPin(this.context, newPinHash);
    this.context = context;
    return this.getLedger();
  }
}
