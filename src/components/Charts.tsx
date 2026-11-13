'use client';
import { fmt } from '@/lib/format';
import type { AlignedReturns } from '@/lib/finance/capm';
import type { BetaStats } from '@/lib/finance/types';

export interface FieldRow {
  label: string;
  low: number;
  high: number;
  point: number;
}

/** Football field: one bar per method, a tick at its central value, a dashed line at the share price. */
export function FootballField({ rows, price }: { rows: FieldRow[]; price: number | null }) {
  if (!rows.length) return null;
  const vals = rows.flatMap((r) => [r.low, r.high]).concat(price != null ? [price] : []);
  const lo = Math.max(0, Math.min(...vals) * 0.85);
  const hi = Math.max(...vals) * 1.08;
  const W = 640;
  const L = 150;
  const rowH = 30;
  const H = rows.length * rowH + 34;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - 16);
  const ticks = niceTicks(lo, hi, 5);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Valuation range per method">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={4} y2={H - 26} stroke="var(--seam)" />
            <text x={x(t)} y={H - 10} textAnchor="middle" className="fill-muted font-mono text-[10px]">
              ${t.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = 8 + i * rowH;
          const w = Math.max(3, x(r.high) - x(r.low));
          return (
            <g key={r.label}>
              <text x={L - 10} y={y + 14} textAnchor="end" className="fill-ink text-[12px]">
                {r.label}
              </text>
              <rect x={x(r.low)} y={y + 4} width={w} height={14} rx={2} className="fill-accent/25" />
              <rect x={x(r.point) - 1.5} y={y + 1} width={3} height={20} className="fill-accent" />
              <title>{`${r.label}: ${fmt(r.low, 'usd')} to ${fmt(r.high, 'usd')}, central ${fmt(r.point, 'usd')}`}</title>
            </g>
          );
        })}
        {price != null && (
          <g>
            <line x1={x(price)} x2={x(price)} y1={0} y2={H - 26} className="stroke-ink" strokeDasharray="3 3" />
            <text x={x(price) + 4} y={10} className="fill-ink font-mono text-[10px]">
              price {fmt(price, 'usd')}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

function niceTicks(lo: number, hi: number, n: number) {
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(+t.toFixed(6));
  return out;
}

export function SensitivityGrid({ s, base }: { s: { waccs: number[]; growths: number[]; grid: (number | null)[][] }; base: number | null }) {
  const flat = s.grid.flat().filter((v): v is number => v != null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  return (
    <div className="overflow-x-auto">
      <table className="num mt-4 border-collapse text-[0.8125rem]">
        <thead>
          <tr>
            <th className="px-3 py-1.5 text-left font-sans text-xs font-normal text-muted">WACC \ terminal g</th>
            {s.growths.map((g) => (
              <th key={g} className="px-3 py-1.5 text-right font-normal text-muted">
                {fmt(g, 'pct')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.waccs.map((w, i) => (
            <tr key={w}>
              <th className="px-3 py-1.5 text-left font-normal text-muted">{fmt(w, 'pct')}</th>
              {s.grid[i].map((v, j) => {
                const t = v == null ? 0 : (v - min) / (max - min || 1);
                const isBase = i === 2 && j === 2;
                return (
                  <td
                    key={j}
                    className={`px-3 py-1.5 text-right ${isBase ? 'outline outline-1 outline-accent' : ''}`}
                    style={{ background: v == null ? undefined : `rgb(var(--accent) / ${0.05 + t * 0.3})` }}
                  >
                    {v == null ? 'n/a' : fmt(v, 'usd')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {base != null && <p className="mt-2 text-xs text-muted">Outlined: the base case. Shading runs from lowest to highest value; it is not a signal.</p>}
    </div>
  );
}

export function BetaScatter({ a, stats }: { a: AlignedReturns; stats: BetaStats }) {
  const W = 320;
  const H = 240;
  const P = 28;
  const all = [...a.stock, ...a.market];
  const m = Math.max(0.05, ...all.map(Math.abs)) * 1.05;
  const x = (v: number) => P + ((v + m) / (2 * m)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v + m) / (2 * m)) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm" role="img" aria-label={`Regression of stock on market returns, beta ${stats.beta.toFixed(2)}`}>
      <line x1={x(-m)} x2={x(m)} y1={y(0)} y2={y(0)} stroke="var(--seam)" />
      <line x1={x(0)} x2={x(0)} y1={y(-m)} y2={y(m)} stroke="var(--seam)" />
      {a.market.map((mv, i) => (
        <circle key={i} cx={x(mv)} cy={y(a.stock[i])} r={2.6} className="fill-accent/50" />
      ))}
      <line x1={x(-m)} y1={y(stats.alpha - stats.beta * m)} x2={x(m)} y2={y(stats.alpha + stats.beta * m)} className="stroke-accent" strokeWidth={1.5} />
      <text x={W - P} y={H - 8} textAnchor="end" className="fill-muted font-mono text-[10px]">
        market return
      </text>
      <text x={8} y={14} className="fill-muted font-mono text-[10px]">
        stock return
      </text>
    </svg>
  );
}


/** Revenue (pale) with free cash flow inside it (maroon), per fiscal year. Bars rise on load. */
export function HistoryChart({ years, revenue, fcf }: { years: number[]; revenue: (number | null)[]; fcf: (number | null)[] }) {
  const n = years.length;
  if (!n) return null;
  const W = 360;
  const H = 150;
  const base = H - 22;
  const max = Math.max(1, ...revenue.map((v) => v ?? 0));
  const step = (W - 10) / n;
  const bw = Math.min(30, step - 8);
  const y = (v: number) => base - (Math.max(0, v) / max) * (base - 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue and free cash flow by fiscal year">
      <line x1={0} x2={W} y1={base} y2={base} stroke="var(--seam-color)" strokeDasharray="4 4" />
      {years.map((yr, i) => {
        const x = 5 + i * step + (step - bw) / 2;
        const r = revenue[i] ?? 0;
        const f = fcf[i];
        return (
          <g key={yr}>
            <rect className="dcf-bar fill-panel-strong" x={x} y={y(r)} width={bw} height={base - y(r)} rx={2} style={{ animationDelay: `${i * 50}ms` }}>
              <title>{`FY${yr} revenue $${(r / 1e9).toFixed(1)}B`}</title>
            </rect>
            {f != null && f > 0 && (
              <rect className="dcf-bar fill-accent" x={x + bw * 0.22} y={y(f)} width={bw * 0.56} height={base - y(f)} rx={1.5} style={{ animationDelay: `${400 + i * 50}ms` }}>
                <title>{`FY${yr} free cash flow $${(f / 1e9).toFixed(1)}B`}</title>
              </rect>
            )}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted font-mono text-[9px]">
              {`'${String(yr).slice(2)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
