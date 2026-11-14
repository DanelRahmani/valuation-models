'use client';
/** The valuation in three sentences: the range, what drives it, and what the price assumes. */
import type { Assumptions } from '@/lib/finance/assumptions';
import { medianGrowth } from '@/lib/finance/metrics';
import type { RunOutput } from '@/lib/finance/run';
import type { Historicals } from '@/lib/finance/types';
import { fmt } from '@/lib/format';
import { FootballField, type FieldRow } from './Charts';

const pct = (x: number | null | undefined) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);

export function SimpleView({ name, h, a, out, field, onExpert }: { name: string; h: Historicals; a: Assumptions; out: RunOutput; field: FieldRow[]; onExpert: () => void }) {
  const I = out.values.inputs;
  const price = I.price ?? null;
  const points = field.map((r) => r.point).filter((x) => Number.isFinite(x) && x > 0);
  const lo = points.length ? Math.min(...points) : null;
  const hi = points.length ? Math.max(...points) : null;
  const where = price == null || lo == null || hi == null ? null : price < lo ? 'below' : price > hi ? 'above' : 'inside';
  const tvShare = out.values.sheets.FCFF?.tv_share?.[0] ?? null;
  const past = medianGrowth(h);
  const sentences: string[] = [];
  if (lo != null && hi != null)
    sentences.push(
      `The methods on this page put ${name} between ${fmt(lo, 'usd')} and ${fmt(hi, 'usd')} a share${
        price != null ? `; the ${fmt(price, 'usd')} price sits ${where === 'inside' ? 'inside that range' : `${where} it`}` : ''
      }.`,
    );
  if (a.financial)
    sentences.push(
      `As a ${a.roe != null && I.re != null && a.roe > I.re ? 'bank or insurer earning more than its cost of equity' : 'bank or insurer'}, it is valued on its book equity: a ${pct(a.roe)} return on equity against a ${pct(I.re)} cost of equity sets how far above or below book it should trade.`,
    );
  else if (tvShare != null)
    sentences.push(
      `${pct(tvShare).replace('.0', '')} of the cash-flow value comes after year 10, so the answer rests mostly on long-run growth of ${pct(a.gT)} and a ${pct(I.wacc)} cost of capital, not on next year's results.`,
    );
  if (out.reverse.growth != null && price != null)
    sentences.push(
      `To justify today's price, revenue would need to grow ${pct(out.reverse.growth)} a year for five years${past != null ? `, against a median of ${pct(past)} over the last three` : ''}.`,
    );
  else if (out.reverse.message) sentences.push(out.reverse.message);

  return (
    <section className="mt-12">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div>
          <p className="font-serif text-3xl leading-snug sm:text-4xl">
            {lo != null && hi != null ? (
              <>
                Worth about <span className="text-accent">{fmt(lo, 'usd')}</span> to <span className="text-accent">{fmt(hi, 'usd')}</span> a share
              </>
            ) : (
              'Not enough data for a range'
            )}
          </p>
          {price != null && <p className="mt-2 text-muted">Last price {fmt(price, 'usd')}</p>}
          <ol className="mt-8 space-y-4">
            {sentences.slice(0, 3).map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="num mt-0.5 text-sm text-accent">{i + 1}</span>
                <span className="max-w-prose leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={onExpert} className="link mt-8 text-sm">
            See every assumption and model
          </button>
        </div>
        <div>
          <FootballField rows={field} price={price} />
          <p className="mt-3 text-xs text-muted">Each bar is one valuation method, moving the discount rate a point either way.</p>
        </div>
      </div>
    </section>
  );
}
