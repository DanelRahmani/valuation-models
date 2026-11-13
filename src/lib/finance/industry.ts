/** Map a GICS sub-industry to the closest Damodaran industry name by word overlap. */
const STOP = new Set(['and', '&', 'the', 'of', 'services', 'products', 'general', 'other', 'misc', '(general)']);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ''))
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Hand-fixed pairs where word overlap picks badly. */
const FIXED: Record<string, string> = {
  Semiconductors: 'Semiconductor',
  'Semiconductor Materials & Equipment': 'Semiconductor Equip',
  'Diversified Banks': 'Bank (Money Center)',
  'Regional Banks': 'Banks (Regional)',
  'Systems Software': 'Software (System & Application)',
  'Application Software': 'Software (System & Application)',
  'Interactive Media & Services': 'Software (Internet)',
  'Technology Hardware, Storage & Peripherals': 'Computers/Peripherals',
  'Soft Drinks & Non-alcoholic Beverages': 'Beverage (Soft)',
  Pharmaceuticals: 'Drugs (Pharmaceutical)',
  Biotechnology: 'Drugs (Biotechnology)',
  'Integrated Oil & Gas': 'Oil/Gas (Integrated)',
  'Oil & Gas Exploration & Production': 'Oil/Gas (Production and Exploration)',
  'Electric Utilities': 'Utility (General)',
  'Multi-Utilities': 'Utility (General)',
  'Broadline Retail': 'Retail (General)',
  'Automobile Manufacturers': 'Auto & Truck',
  'Movies & Entertainment': 'Entertainment',
  'Aerospace & Defense': 'Aerospace/Defense',
  'Property & Casualty Insurance': 'Insurance (Prop/Cas.)',
  'Life & Health Insurance': 'Insurance (Life)',
  'Multi-line Insurance': 'Insurance (General)',
  'Investment Banking & Brokerage': 'Brokerage & Investment Banking',
  'Asset Management & Custody Banks': 'Investments & Asset Management',
  'Transaction & Payment Processing Services': 'Information Services',
  'Health Care Equipment': 'Healthcare Products',
  'Managed Health Care': 'Healthcare Support Services',
  'Restaurants': 'Restaurant/Dining',
  'Hotels, Resorts & Cruise Lines': 'Hotel/Gaming',
  'Casinos & Gaming': 'Hotel/Gaming',
  'Passenger Airlines': 'Air Transport',
  'Rail Transportation': 'Transportation (Railroads)',
};

export function guessIndustry(subIndustry: string, names: string[]): string | null {
  if (FIXED[subIndustry] && names.includes(FIXED[subIndustry])) return FIXED[subIndustry];
  const a = new Set(words(subIndustry));
  let best: string | null = null;
  let score = 0;
  for (const n of names) {
    const b = words(n);
    const hit = b.filter((w) => a.has(w)).length;
    const s = hit / Math.max(1, new Set([...a, ...b]).size);
    if (s > score) {
      score = s;
      best = n;
    }
  }
  return score > 0 ? best : null;
}
