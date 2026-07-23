import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BlockRecord } from '../types/blocks';

function formatDifficulty(diff: number | null | undefined): string {
  if (!diff) return '--';
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(2)}K`;
  return diff.toLocaleString();
}

// Global listener for the main-process 'block-found' event. Shows a celebratory
// overlay when a solo miner finds a block. Mounted once from Layout.
export function BlockFoundModal() {
  const [block, setBlock] = useState<BlockRecord | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.electronAPI.onBlockFound((b) => {
      setBlock(b as unknown as BlockRecord);
    });
    return () => window.electronAPI.removeAllListeners('block-found');
  }, []);

  if (!block) return null;

  const coin = String(block.coin || '').toUpperCase();
  const value = block.fiat_value != null
    ? `$${Number(block.fiat_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

  const viewHistory = () => {
    setBlock(null);
    navigate('/blocks');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 animate-page-glitch"
      onClick={() => setBlock(null)}
    >
      <div
        className="vault-card max-w-md w-full p-6 text-center border-2"
        style={{ borderColor: 'var(--color-success)', boxShadow: '0 0 40px rgba(0,255,65,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-3">🎉</div>
        <div
          className="text-3xl font-bold mb-2 text-success uppercase tracking-wider"
          style={{ textShadow: '0 0 12px var(--color-success)' }}
        >
          Block Found!
        </div>
        <div className="text-lg text-text-primary mb-1">
          {block.device_name} found a {coin} block
        </div>
        {block.block_height != null && (
          <div className="text-sm text-text-secondary mb-3">Block #{block.block_height}</div>
        )}

        <div className="grid grid-cols-2 gap-3 my-4 text-left">
          <Stat label="Share Diff" value={formatDifficulty(block.share_diff || 0)} />
          <Stat label="Network Diff" value={formatDifficulty(block.network_diff || 0)} />
          {block.reward != null && <Stat label="Reward" value={`${block.reward} ${coin}`} />}
          {value && <Stat label="Est. Value" value={value} />}
        </div>

        <div className="text-xs text-warning mb-4">
          Provisional — confirm against the blockchain before celebrating too hard.
        </div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={viewHistory}
            className="px-4 py-2 rounded bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors text-sm"
          >
            View History
          </button>
          <button
            onClick={() => setBlock(null)}
            className="px-4 py-2 rounded bg-bg-secondary text-text-secondary border border-border hover:text-text-primary transition-colors text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-secondary/60 border border-border rounded p-2">
      <div className="text-[10px] text-text-secondary uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-text-primary">{value}</div>
    </div>
  );
}
