'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IndexFile } from '@/lib/finance/types';

export function TickerSearch({
  onPick,
  placeholder,
  compact,
  exclude = [],
}: { onPick?: (ticker: string) => void; placeholder?: string; compact?: boolean; exclude?: string[] } = {}) {
  const router = useRouter();
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    fetch('/data/index.json').then((r) => r.json()).then(setIndex).catch(() => setIndex(null));
  }, []);
  const hits = useMemo(() => {
    if (!index || !q.trim()) return [];
    const s = q.trim().toLowerCase();
    return index.companies
      .map((c) => ({ c, score: c.ticker.toLowerCase() === s ? 0 : c.ticker.toLowerCase().startsWith(s) ? 1 : c.name.toLowerCase().includes(s) ? 2 : 9 }))
      .filter((x) => x.score < 9 && !exclude.includes(x.c.ticker))
      .sort((a, b) => a.score - b.score || a.c.ticker.localeCompare(b.c.ticker))
      .slice(0, 8)
      .map((x) => x.c);
  }, [index, q, exclude]);
  const go = (t: string) => {
    if (onPick) {
      onPick(t);
      setQ('');
      return;
    }
    router.push(`/value/?t=${encodeURIComponent(t)}`);
  };
  return (
    <div className="relative max-w-xl">
      <input
        value={q}
        onChange={(e) => (setQ(e.target.value), setActive(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && hits[active]) go(hits[active].ticker);
        }}
        placeholder={placeholder ?? 'Ticker or company, e.g. NVDA or Coca-Cola'}
        aria-label="Search S&P 500 companies"
        className={`w-full rounded border border-seam bg-panel outline-none transition-colors focus:border-accent ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-lg'}`}
      />
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-seam bg-panel shadow-[0_8px_30px_rgba(74,14,14,0.12)]">
          {hits.map((c, i) => (
            <li key={c.ticker}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c.ticker)}
                className={`flex w-full items-baseline justify-between gap-4 px-4 py-2 text-left ${i === active ? 'bg-accent/10' : ''}`}
              >
                <span>
                  <span className="num mr-3 text-accent">{c.ticker}</span>
                  {c.name}
                </span>
                <span className="font-mono text-[0.6875rem] text-muted">{c.sector}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {index && !compact && (
        <p className="mt-2 font-mono text-[0.6875rem] text-muted">
          {index.companies.length} companies · data as of {index.asOf}
        </p>
      )}
    </div>
  );
}
