import type { ConnectStatus } from '../hooks/useMidnight';

type Props = {
  status: ConnectStatus;
  address: string | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
};

function short(address: string): string {
  return address.length > 20 ? `${address.slice(0, 12)}…${address.slice(-6)}` : address;
}

export function WalletConnect({ status, address, error, onConnect, onDisconnect }: Props) {
  if (status === 'connected' && address) {
    return (
      <div className="wallet-panel wallet-panel--connected">
        <span className="wallet-dot" aria-hidden="true" />
        <div className="wallet-info">
          <span className="wallet-label">Lace wallet connected</span>
          <code className="wallet-address" title={address}>
            {short(address)}
          </code>
        </div>
        <button className="btn btn--ghost" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-panel">
      <div className="wallet-info">
        <span className="wallet-label wallet-label--muted">Wallet not connected</span>
        {error && <span className="wallet-error">{error}</span>}
      </div>
      <button className="btn btn--primary" onClick={onConnect} disabled={status === 'connecting'}>
        {status === 'connecting' ? 'Connecting…' : 'Connect Lace wallet'}
      </button>
    </div>
  );
}
