'use client';
/** "Checked against Nasdaq" badge, from the monthly data checks (public/data/qa.json). */
import { useEffect, useId, useState } from 'react';

interface QaIssue {
  id: string;
  severity: 'error' | 'warn';
  message: string;
}
interface QaFile {
  asOf: string;
  companies: Record<string, QaIssue[]>;
  reference: Record<string, Partial<Record<'revenue' | 'netIncome' | 'equity', number>>>;
}

let qaP: Promise<QaFile | null> | null = null;
const loadQa = () => (qaP ??= fetch('/data/qa.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

const NAMES = { revenue: 'revenue', netIncome: 'net income', equity: 'equity' } as const;

export function QaBadge({ ticker }: { ticker: string }) {
  const [qa, setQa] = useState<QaFile | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    loadQa().then(setQa);
  }, []);
  if (!qa || !ticker) return null;
  const ref = qa.reference[ticker] ?? {};
  const issues = (qa.companies[ticker] ?? []).filter((i) => !i.id.startsWith('ref-'));
  const items = Object.entries(ref) as [keyof typeof NAMES, number][];
  if (!items.length && !issues.length) return null;
  const allMatch = items.length > 0 && items.every(([, g]) => g <= 0.02);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-seam px-2.5 py-0.5 font-mono text-[0.6875rem] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <span aria-hidden className={allMatch ? 'text-accent' : ''}>
          {allMatch ? '✓' : '!'}
        </span>
        {items.length ? (
          <>
            <span className="sm:hidden">Checked against Nasdaq</span>
            <span className="hidden sm:inline">
              Checked against Nasdaq: {items.map(([k, g]) => `${NAMES[k]} ${g <= 0.02 ? '✓' : `${(g * 100).toFixed(0)}% off`}`).join(' · ')}
            </span>
          </>
        ) : (
          'Data notes'
        )}
      </button>
      {open && (
        <span id={id} role="note" className="absolute left-0 top-full z-20 mt-2 block w-[min(26rem,85vw)] rounded-xl border border-seam bg-bg p-4 text-left text-xs leading-relaxed shadow-sm">
          <span className="block text-ink">
            Each month this company&apos;s figures are tested against the rest of its filing (net income over shares must reproduce the reported EPS, debt cannot
            exceed liabilities) and its revenue, net income and equity are compared with Nasdaq&apos;s independently compiled statements.
          </span>
          {issues.length > 0 && (
            <span className="mt-3 block">
              {issues.map((i) => (
                <span key={i.id + i.message} className="mt-1 block text-muted">
                  {i.severity === 'error' ? 'Error: ' : 'Note: '}
                  {i.message}
                </span>
              ))}
            </span>
          )}
          <span className="mt-3 block font-mono text-[0.625rem] text-muted">Checked {qa.asOf}</span>
        </span>
      )}
    </span>
  );
}
