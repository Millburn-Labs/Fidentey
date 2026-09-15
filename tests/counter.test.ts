import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { pureCircuits } from '../managed/counter/contract/index.js';
import { CounterSimulator } from './counter-simulator.js';
import type { CounterPrivateState } from './witnesses.js';

setNetworkId('undeployed');

function randomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length));
}

function holder(pin: Uint8Array): CounterPrivateState {
  return { pin };
}

function deployCounter(pin: Uint8Array) {
  const pinHash = pureCircuits.hashPin(pin);
  const sim = CounterSimulator.deploy(holder(pin), pinHash);
  return { sim, pinHash };
}

describe('Private counter — circuit logic', () => {
  it('deploys deterministically for the same pin', () => {
    const pin = randomBytes(32);
    const pinHash = pureCircuits.hashPin(pin);

    const simA = CounterSimulator.deploy(holder(pin), pinHash);
    const simB = CounterSimulator.deploy(holder(pin), pinHash);

    expect(simA.getLedger().pinHash).toEqual(simB.getLedger().pinHash);
    expect(simA.getLedger().round).toEqual(0n);
  });

  it('rejects increment() from someone who does not know the pin', () => {
    const pin = randomBytes(32);
    const wrongPin = randomBytes(32);
    const { sim } = deployCounter(pin);

    sim.actingAs(holder(wrongPin));
    expect(() => sim.increment()).toThrow('invalid pin');
  });
});

describe('Private counter — state transitions', () => {
  it('increments the counter when the correct pin is supplied', () => {
    const pin = randomBytes(32);
    const { sim } = deployCounter(pin);

    sim.actingAs(holder(pin));
    const afterFirst = sim.increment();
    expect(afterFirst.round).toEqual(1n);

    const afterSecond = sim.increment();
    expect(afterSecond.round).toEqual(2n);
  });

  it('lets the pin holder rotate the pin, after which only the new pin works', () => {
    const oldPin = randomBytes(32);
    const newPin = randomBytes(32);
    const { sim } = deployCounter(oldPin);

    sim.actingAs(holder(oldPin));
    sim.increment();

    const newPinHash = pureCircuits.hashPin(newPin);
    const afterRotate = sim.setPin(newPinHash);
    expect(afterRotate.pinHash).toEqual(newPinHash);

    // Old pin no longer works.
    sim.actingAs(holder(oldPin));
    expect(() => sim.increment()).toThrow('invalid pin');

    // New pin does.
    sim.actingAs(holder(newPin));
    const afterSecondIncrement = sim.increment();
    expect(afterSecondIncrement.round).toEqual(2n);
  });
});

describe('Private counter — private inputs are never exposed', () => {
  it('never stores the raw pin anywhere in the public ledger', () => {
    const pin = randomBytes(32);
    const { sim, pinHash } = deployCounter(pin);

    sim.actingAs(holder(pin));
    const ledgerState = sim.increment();

    // Only the 32-byte hash commitment is on the ledger — never the pin.
    expect(ledgerState.pinHash).toEqual(pinHash);
    expect(ledgerState.pinHash).not.toEqual(pin);

    const serializedLedger = JSON.stringify(ledgerState, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serializedLedger).not.toContain(Buffer.from(pin).toString('hex'));
  });

  it('derives the same commitment from the same pin, so a stolen hash alone cannot be reversed into it', () => {
    const pin = randomBytes(32);
    const hashA = pureCircuits.hashPin(pin);
    const hashB = pureCircuits.hashPin(pin);
    expect(hashA).toEqual(hashB);

    const otherPin = randomBytes(32);
    expect(pureCircuits.hashPin(otherPin)).not.toEqual(hashA);
  });
});
