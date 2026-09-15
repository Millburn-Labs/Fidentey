# Private Counter

> A public counter on Midnight that only someone who knows a secret PIN can increment — the PIN itself never touches the chain, only a commitment to it.

## Contract Address

| Network  | Address                          |
|----------|-----------------------------------|
| Preview  | _pending — deploy in progress_    |
| Preprod  | _not deployed_                    |

## What This Does

This contract keeps a simple counter (`round`) on the public Midnight ledger. Anyone can read the current count. But advancing it — or changing who is allowed to advance it — requires proving knowledge of a secret PIN, without ever revealing that PIN to the chain, the indexer, or any observer.

At deploy time the owner picks a PIN and the contract stores only `pinHash`, a one-way hash commitment to it. To call `increment()`, the caller supplies their PIN as a private witness; the circuit hashes it inside a zero-knowledge proof and checks it against the stored `pinHash`. If it matches, the counter goes up and the proof is valid — but the PIN itself is never part of the transaction. A `setPin()` circuit lets the current PIN holder rotate to a new PIN the same way, deliberately disclosing only the new commitment.

## Privacy Model

- **What is PUBLIC (on-chain, visible to anyone):**
  - `round` — the current counter value
  - `pinHash` — a 32-byte hash commitment to the current PIN (never the PIN itself)

- **What is PRIVATE (private witness, never on-chain):**
  - `localSecretPin` — the raw PIN, supplied off-chain by the caller as a witness. It exists only inside the caller's local proof computation and is never written to the ledger, a transaction, or any log.

- **What the user PROVES without revealing:**
  - Calling `increment()` or `setPin()` proves "I know a PIN whose hash equals the commitment currently stored on-chain" — without revealing the PIN, without revealing any information that would help guess it, and without it ever appearing in cleartext anywhere.

## Tech Stack

- Midnight network (Preview testnet)
- Compact language (`compact` compiler v0.5.1, `language_version >= 0.23`)
- Node.js v22+
- Docker (for the local proof server)
- TypeScript, Vitest

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or later
- [Docker](https://www.docker.com/) (running, for the proof server)
- The Compact compiler (`compact --version` should print a version number)

## Setup

```bash
# Clone and install
git clone <this-repo-url>
cd counter
npm install

# Start the local proof server (needed for compiling/testing/deploying)
docker pull midnightnetwork/proof-server
docker run -p 6300:6300 midnightnetwork/proof-server

# Compile the contract
npm run compile

# Deploy to the Preview testnet
npm run deploy
# — prints a wallet address; fund it at the Preview faucet, then the
#   script continues automatically once funds arrive.

# Check your wallet / network state at any time
npm run check-balance
npm run network
```

## Run Tests

```bash
npm test
```

Covers: circuit logic (deterministic deploy, rejecting a wrong PIN), state transitions (incrementing, rotating the PIN), and that private inputs are never exposed (the raw PIN never appears anywhere in the public ledger state).

## Initial Idea

_[LEAVE PLACEHOLDER — to be filled in manually]_

## Screenshots

_[LEAVE PLACEHOLDER — compile output and contract address screenshots to be added]_
