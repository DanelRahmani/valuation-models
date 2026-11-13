'use client';
import { useEffect, useState } from 'react';
import type { Fmt } from '@/lib/finance/calcsheet';
import { fmt, fromDisplay, toDisplay } from '@/lib/format';

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.75rem] uppercase tracking-wider text-muted">{children}</span>;
}

export function Seam() {
  return <hr className="my-12 border-0 border-t border-seam" />;
}

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-px font-mono text-[0.6875rem] ${
        tone === 'accent' ? 'border-accent/40 text-accent' : 'border-seam text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/** Numeric field that edits percentages as whole numbers and reports where its value came from. */
export function NumberField({
  label,
  value,
  fmt: f,
  source,
  onChange,
  step,
}: {
  label: string;
  value: number | null;
  fmt: Fmt;
  source?: string;
  onChange: (v: number | null) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(toDisplay(value, f)));
  useEffect(() => setText(String(toDisplay(value, f))), [value, f]);
  const unit = f === 'pct' ? '%' : f === 'x' ? 'x' : f === 'usd' ? '$' : f === 'usdm' ? '$M' : f === 'shares' ? 'M' : '';
  return (
    <label className="group block py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="flex items-baseline gap-1">
          <input
            inputMode="decimal"
            type="number"
            step={step ?? (f === 'pct' ? 0.1 : 'any')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onChange(fromDisplay(text, f))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`num w-28 rounded border bg-transparent px-2 py-0.5 text-right text-sm outline-none transition-colors focus:border-accent ${
              value == null ? 'border-accent/60' : 'border-seam'
            }`}
            aria-label={label}
          />
          <span className="num w-6 text-xs text-muted">{unit}</span>
        </span>
      </div>
      {source && <div className="mt-0.5 font-mono text-[0.6875rem] leading-4 text-muted">{value == null ? 'Needs input' : source}</div>}
    </label>
  );
}

export function ReadOnly({ label, value, f, note }: { label: string; value: number | null | undefined; f: Fmt; note?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-sm">
      <span className="text-muted">
        {label}
        {note && <span className="ml-1 font-mono text-[0.6875rem]">{note}</span>}
      </span>
      <span className="num">{fmt(value, f) || '-'}</span>
    </div>
  );
}
