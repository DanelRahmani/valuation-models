import type { Fmt } from './finance/calcsheet';

export function fmt(v: number | null | undefined, f: Fmt): string {
  if (v == null || !Number.isFinite(v)) return '';
  switch (f) {
    case 'usd':
      return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'usdm':
      return Math.abs(v) >= 1e5
        ? `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`
        : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
    case 'pct':
      return `${(v * 100).toFixed(1)}%`;
    case 'x':
      return `${v.toFixed(1)}x`;
    case 'beta':
      return v.toFixed(2);
    case 'shares':
      return `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
    default:
      return Math.abs(v) < 10 ? v.toFixed(3) : v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
}

/** Display value <-> stored value for editable fields (percentages are edited as 5.0, stored as 0.05). */
export const toDisplay = (v: number | null, f: Fmt) => (v == null ? '' : f === 'pct' ? +(v * 100).toFixed(3) : +v.toFixed(4));
export const fromDisplay = (s: string, f: Fmt) => {
  const n = Number(s);
  if (s.trim() === '' || !Number.isFinite(n)) return null;
  return f === 'pct' ? n / 100 : n;
};

/** ISO date as "30 Sep 2026". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
