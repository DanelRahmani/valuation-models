'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { IndexFile } from '@/lib/finance/types';

let cached: Promise<IndexFile | null> | null = null;
export const loadIndex = () => (cached ??= fetch('/data/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function pickRandom(index: IndexFile, not?: string) {
  const list = index.companies.filter((c) => c.ticker !== not);
  return list[Math.floor(Math.random() * list.length)];
}

/** Opens the valuation of a random S&P 500 company. */
export function RandomCompanyButton({ compact = false, current }: { compact?: boolean; current?: string }) {
  const router = useRouter();
  const [index, setIndex] = useState<IndexFile | null>(null);
  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);
  const go = () => {
    if (!index) return;
    router.push(`/value/?t=${encodeURIComponent(pickRandom(index, current).ticker)}`);
  };
  if (compact)
    return (
      <button
        type="button"
        onClick={go}
        disabled={!index}
        aria-label="Value a random company"
        title="Value a random company"
        className="nav-glass hidden h-10 w-10 place-items-center rounded-full text-accent sm:grid shadow-lg shadow-[rgba(74,14,14,0.05)] ring-1 ring-[var(--seam)] transition-transform hover:rotate-12 hover:scale-105"
      >
        <DiceIcon />
      </button>
    );
  return (
    <button
      type="button"
      onClick={go}
      disabled={!index}
      className="inline-flex items-center gap-2 rounded-full bg-panel-strong px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
    >
      <DiceIcon /> Value a random company
    </button>
  );
}

export function DiceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}
