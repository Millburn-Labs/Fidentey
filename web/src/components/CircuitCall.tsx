import { useState } from 'react';
import type { RevealOutcome } from '../hooks/useMidnight';

type Props = {
  connected: boolean;
  busy: boolean;
  error: string | null;
  lastTxHash: string | null;
  lastOutcome: RevealOutcome | null;
  onSubmitGuess: (guess: number) => Promise<string>;
  onReveal: (secretNumber: number) => Promise<RevealOutcome>;
};

const OUTCOME_LABEL: Record<RevealOutcome, string> = {
  'too-low': 'Too low',
  'too-high': 'Too high',
  correct: 'Correct — game solved!',
};

export function CircuitCall({ connected, busy, error, lastTxHash, lastOutcome, onSubmitGuess, onReveal }: Props) {
  const [guess, setGuess] = useState('');
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState<'guess' | 'reveal' | null>(null);

  const submitGuess = async () => {
    const n = Number(guess);
    if (!Number.isInteger(n) || n < 0) return;
    setPending('guess');
    try {
      await onSubmitGuess(n);
      setGuess('');
    } catch {
      // surfaced via `error` from the hook
    } finally {
      setPending(null);
    }
  };

  const reveal = async () => {
    const n = Number(secret);
    if (!Number.isInteger(n) || n < 0) return;
    setPending('reveal');
    try {
      await onReveal(n);
    } catch {
      // surfaced via `error` from the hook
    } finally {
      // Cleared unconditionally, win or lose — the raw number never lingers
      // in component state, and it was never rendered anywhere in the UI.
      setSecret('');
      setPending(null);
    }
  };

  return (
    <div className="circuit-panel">
      <section className="circuit-card">
        <h3>Submit a guess</h3>
        <p className="circuit-hint">Public — anyone can post a guess for the host to reveal against.</p>
        <div className="circuit-row">
          <input
            type="number"
            min={0}
            max={1000}
            placeholder="1–1000"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            disabled={!connected || busy}
          />
          <button className="btn btn--primary" onClick={submitGuess} disabled={!connected || busy || guess === ''}>
            {pending === 'guess' ? 'Submitting…' : 'Submit guess'}
          </button>
        </div>
      </section>

      <section className="circuit-card">
        <h3>Reveal (host only)</h3>
        <p className="circuit-hint">
          Enter the secret number you deployed with. It is used locally to build a zero-knowledge proof and is{' '}
          <strong>never</strong> sent anywhere or shown on screen again.
        </p>
        <div className="circuit-row">
          <input
            type="password"
            autoComplete="off"
            placeholder="Secret number"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            disabled={!connected || busy}
          />
          <button className="btn btn--primary" onClick={reveal} disabled={!connected || busy || secret === ''}>
            {pending === 'reveal' ? 'Generating proof…' : 'Reveal guess'}
          </button>
        </div>
        <p className="circuit-badge">🔒 Proved without revealing your input</p>
      </section>

      {pending === 'reveal' && (
        <p className="circuit-status">Generating zero-knowledge proof locally in your browser — this can take a moment…</p>
      )}

      {error && <p className="circuit-error">{error}</p>}

      {lastTxHash && (
        <div className="circuit-result">
          <p>
            <strong>Transaction:</strong> <code>{lastTxHash}</code>
          </p>
          {lastOutcome && (
            <p>
              <strong>Result:</strong> {OUTCOME_LABEL[lastOutcome]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
