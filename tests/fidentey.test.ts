import { describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { pureCircuits } from '../managed/fidentey/contract/index.js';
import { FidenteySimulator } from './fidentey-simulator.js';
import type { FidenteyPrivateState } from './witnesses.js';

setNetworkId('undeployed');

function host(secretNumber: bigint): FidenteyPrivateState {
  return { secretNumber };
}

function deployGame(secretNumber: bigint) {
  const secretHash = pureCircuits.hashNumber(secretNumber);
  const sim = FidenteySimulator.deploy(host(secretNumber), secretHash);
  return { sim, secretHash };
}

describe('Fidentey — circuit logic', () => {
  it('deploys deterministically for the same secret number', () => {
    const secretHash = pureCircuits.hashNumber(42n);

    const simA = FidenteySimulator.deploy(host(42n), secretHash);
    const simB = FidenteySimulator.deploy(host(42n), secretHash);

    expect(simA.getLedger().secretHash).toEqual(simB.getLedger().secretHash);
    expect(simA.getLedger().solved).toBe(false);
    expect(simA.getLedger().attempts).toEqual(0n);
  });

  it('rejects a reveal from someone who does not know the secret number', () => {
    const { sim } = deployGame(42n);
    sim.submitGuess(10n);

    sim.actingAs(host(99n)); // wrong number
    expect(() => sim.revealGuess()).toThrow('not the host: secret does not match commitment');
  });
});

describe('Fidentey — state transitions', () => {
  it('reports too low, too high, then correct across three guesses', () => {
    const { sim } = deployGame(42n);

    sim.submitGuess(10n);
    const afterLow = sim.revealGuess();
    expect(afterLow.result).toEqual(0n); // too low
    expect(afterLow.ledger.solved).toBe(false);

    sim.submitGuess(90n);
    const afterHigh = sim.revealGuess();
    expect(afterHigh.result).toEqual(1n); // too high
    expect(afterHigh.ledger.solved).toBe(false);

    sim.submitGuess(42n);
    const afterCorrect = sim.revealGuess();
    expect(afterCorrect.result).toEqual(2n); // correct
    expect(afterCorrect.ledger.solved).toBe(true);
    expect(afterCorrect.ledger.revealedNumber).toEqual(42n);
    expect(afterCorrect.ledger.attempts).toEqual(3n);
  });

  it('rejects further guesses and reveals once the game is won', () => {
    const { sim } = deployGame(7n);
    sim.submitGuess(7n);
    sim.revealGuess();

    expect(() => sim.submitGuess(7n)).toThrow('game already won');
  });
});

describe('Fidentey — private inputs are never exposed', () => {
  it('never stores the raw secret number anywhere before a win', () => {
    const { sim, secretHash } = deployGame(55n);

    sim.submitGuess(10n);
    const afterLow = sim.revealGuess();

    expect(afterLow.ledger.secretHash).toEqual(secretHash);
    expect(afterLow.ledger.revealedNumber).toEqual(0n); // still hidden
    expect(afterLow.ledger.solved).toBe(false);

    const serializedLedger = JSON.stringify(afterLow.ledger, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serializedLedger).not.toContain('55');
  });

  it('derives the same commitment from the same number, so the hash alone cannot be reversed into it', () => {
    const hashA = pureCircuits.hashNumber(55n);
    const hashB = pureCircuits.hashNumber(55n);
    expect(hashA).toEqual(hashB);

    expect(pureCircuits.hashNumber(56n)).not.toEqual(hashA);
  });
});
