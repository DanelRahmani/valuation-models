'use client';
import { useState } from 'react';
import { toExcel, toReadable, type SheetDef, type Values, type Workbook } from '@/lib/finance/calcsheet';
import { MODEL_NOTES } from '@/content/modelNotes';
import { fmt } from '@/lib/format';
import { Badge } from './ui';

export function CalcTable({ sheet, wb, values }: { sheet: SheetDef; wb: Workbook; values: Values }) {
  const [focus, setFocus] = useState<{ row: string; col: number } | null>(null);
  const sel = focus && sheet.rows.find((r) => r.key === focus.row);
  const raw = sel ? sel.cells[focus!.col] : null;
  return (
    <div className="min-w-0">
      <div className="max-h-[60vh] max-w-full overflow-auto overscroll-contain rounded border border-seam/60">
        <table className="num w-full border-collapse text-[0.8125rem]">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-seam text-muted">
              <th className="sticky left-0 z-20 bg-panel py-1.5 pl-2 pr-4 text-left font-sans text-xs font-normal">{sheet.rows.some((r) => r.fmt === 'usdm') ? '$ millions' : ''}</th>
              {sheet.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-1.5 text-right font-normal">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.key} className={`border-b border-seam/60 ${r.emphasis ? 'font-semibold' : ''}`}>
                <td className="sticky left-0 min-w-[10rem] bg-panel py-1.5 pl-2 pr-4 font-sans sm:min-w-[15rem]" title={r.note}>
                  {r.label}
                  {r.note && <span className="ml-1 text-accent">*</span>}
                </td>
                {sheet.columns.map((_, c) => {
                  const cell = r.cells[c];
                  const v = values.sheets[sheet.name][r.key]?.[c];
                  const active = focus?.row === r.key && focus?.col === c;
                  return (
                    <td key={c} className="px-0 py-0 text-right">
                      {cell != null ? (
                        <button
                          type="button"
                          onClick={() => setFocus(active ? null : { row: r.key, col: c })}
                          className={`w-full whitespace-nowrap px-2 py-1.5 text-right transition-colors hover:bg-accent/5 ${active ? 'bg-accent/10 text-accent' : ''}`}
                        >
                          {(r.fmt === 'usdm' ? (v == null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 0 })) : fmt(v, r.fmt)) || '-'}
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 min-h-[3.5rem] break-words rounded border border-seam bg-panel/60 px-3 py-2 text-[0.8125rem]">
        {sel && typeof raw === 'string' ? (
          <>
            <div>
              <span className="text-muted">{sel.label}, {sheet.columns[focus!.col]} = </span>
              {toReadable(raw, wb, sheet, sheet.columns)}
            </div>
            <div className="num mt-1 text-muted">Excel: ={toExcel(raw, wb, sheet)}</div>
          </>
        ) : sel ? (
          <span className="text-muted">{sel.label}: a fixed input.</span>
        ) : (
          <span className="text-muted">Click any number to see how it is calculated, in words and as the Excel formula.</span>
        )}
        {sel?.note && <div className="mt-1 text-muted">* {sel.note}</div>}
      </div>
    </div>
  );
}

export function ModelCard({
  sheet,
  perShare,
  price,
  wb,
  values,
  extra,
}: {
  sheet: SheetDef;
  perShare: number | null;
  price: number | null;
  wb: Workbook;
  values: Values;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const note = MODEL_NOTES[sheet.id];
  const ok = sheet.status === 'ok' && perShare != null;
  return (
    <article className="group relative mb-5 rounded-[1.5rem] border border-seam bg-panel/60 p-6 sm:p-7">
      <svg aria-hidden className="card-stitch pointer-events-none absolute inset-0 h-full w-full">
        <rect x="1" y="1" rx="23" />
      </svg>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="font-serif text-2xl sm:text-3xl">{sheet.title}</h3>
        <div className="text-right">
          {ok ? (
            <>
              <div className="num text-3xl text-accent">{fmt(perShare, 'usd')}</div>
              {price != null && <div className="font-mono text-[0.6875rem] text-muted">{((perShare! / price - 1) * 100).toFixed(0)}% vs price</div>}
            </>
          ) : (
            <Badge tone="accent">{sheet.status === 'na' ? 'Not applicable' : 'Needs input'}</Badge>
          )}
        </div>
      </div>
      {sheet.message && <p className="mt-2 text-sm text-muted">{sheet.message}</p>}
      {note && (
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Best for</dt>
            <dd className="mt-1">{note.bestFor}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Watch out</dt>
            <dd className="mt-1">{note.watchOut}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent">Does it survive AI?</dt>
            <dd className="mt-1">{note.ai}</dd>
          </div>
        </dl>
      )}
      {extra}
      <button type="button" onClick={() => setOpen(!open)} className="relative mt-5 rounded-full border border-seam px-4 py-1.5 text-sm text-accent transition-colors hover:bg-panel-strong" aria-expanded={open}>
        {open ? 'Hide calculations' : 'Show calculations'}
      </button>
      {open && (
        <div className="mt-4">
          <CalcTable sheet={sheet} wb={wb} values={values} />
        </div>
      )}
    </article>
  );
}
