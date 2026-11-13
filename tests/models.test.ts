import { describe, it, expect } from 'vitest';
import { evaluate, type Workbook, type InputDef, type SheetDef } from '../src/lib/finance/calcsheet';

const inp = (key: string, value: number): InputDef => ({
  key,
  label: key,
  value,
  fmt: 'pct',
  group: 'Cost of capital',
  source: 'test',
});

const inputs: InputDef[] = [
  { ...inp('d1', 2), fmt: 'usd' },
  inp('re', 0.1),
  inp('g', 0.04),
  inp('wacc', 0.1),
  inp('gT', 0.02),
];

const gordon: SheetDef = {
  id: 'ddm_gordon',
  name: 'Gordon',
  title: 'Gordon',
  columns: ['Value'],
  rows: [{ key: 'v', label: 'v', fmt: 'usd', cells: ['=d1/(re-g)'] }],
  result: { row: 'v', col: 0 },
  status: 'ok',
};

const years = [1, 2, 3, 4, 5];
const fcffSheet: SheetDef = {
  id: 'fcff',
  name: 'FCFF',
  title: 'FCFF',
  columns: ['Base', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'],
  rows: [
    { key: 'fcff', label: 'FCFF', fmt: 'usdm', cells: [null, 100, 100, 100, 100, 100] },
    { key: 'df', label: 'DF', fmt: 'num', cells: [null, ...years.map((t) => `=1/(1+wacc)^${t}`)] },
    { key: 'pv', label: 'PV', fmt: 'usdm', cells: [null, ...years.map((t) => `=@fcff[${t}]*@df[${t}]`)] },
    {
      key: 'tv',
      label: 'TV',
      fmt: 'usdm',
      cells: [null, null, null, null, null, '=@fcff[5]*(1+gT)/(wacc-gT)'],
    },
    { key: 'ev', label: 'EV', fmt: 'usdm', cells: ['=SUM(@pv[1]:@pv[5])+@tv[5]*@df[5]'], emphasis: true },
  ],
  result: { row: 'ev', col: 0 },
  status: 'ok',
};

const wb: Workbook = { inputs, sheets: [gordon, fcffSheet] };

describe('models', () => {
  it('gordon and fcff match worked example', () => {
    const vals = evaluate(wb);

    expect(vals.sheets.Gordon.v[0]).toBeCloseTo(33.3333, 3);

    let expected = 0;
    for (let t = 1; t <= 5; t++) expected += 100 / Math.pow(1.1, t);
    expected += (100 * 1.02) / (0.1 - 0.02) / Math.pow(1.1, 5);
    expect(vals.sheets.FCFF.ev[0]).toBeCloseTo(expected, 6);
  });
});
