import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { CONTRACT_ADDRESS, NETWORK_ID } from './lib/network';

export function App() {
  const midnight = useMidnight();

  return (
    <main className="app">
      <header className="app-header">
        <h1>Fidentey</h1>
        <p>A private guess-the-number game on Midnight — prove a guess is too high, too low, or correct, without revealing the secret number.</p>
        <p className="contract-line">
          Contract ({NETWORK_ID}): <code>{CONTRACT_ADDRESS}</code>
        </p>
      </header>

      <WalletConnect
        status={midnight.status}
        address={midnight.address}
        error={midnight.status === 'error' ? midnight.error : null}
        onConnect={midnight.connect}
        onDisconnect={midnight.disconnect}
      />

      <CircuitCall
        connected={midnight.status === 'connected'}
        busy={midnight.busy}
        error={midnight.status !== 'error' ? midnight.error : null}
        lastTxHash={midnight.lastTxHash}
        lastOutcome={midnight.lastOutcome}
        onSubmitGuess={midnight.submitGuess}
        onReveal={midnight.setSecretAndReveal}
      />
    </main>
  );
}
