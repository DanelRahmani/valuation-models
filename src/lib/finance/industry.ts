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
  'Agricultural Products & Services': 'Farming/Agriculture',
  'Air Freight & Logistics': 'Transportation',
  'Apparel Retail': 'Retail (Special Lines)',
  'Cargo Ground Transportation': 'Trucking',
  'Communications Equipment': 'Telecom. Equipment',
  'Computer & Electronics Retail': 'Retail (Special Lines)',
  'Consumer Finance': 'Financial Svcs. (Non-bank & Insurance)',
  Copper: 'Metals & Mining',
  'Data Processing & Outsourced Services': 'Information Services',
  'Distillers & Vintners': 'Beverage (Alcoholic)',
  'Diversified Support Services': 'Business & Consumer Services',
  'Food Distributors': 'Food Wholesalers',
  Footwear: 'Shoe',
  'Gas Utilities': 'Utility (General)',
  Gold: 'Precious Metals',
  'Health Care Distributors': 'Healthcare Support Services',
  'Health Care Services': 'Healthcare Support Services',
  'Health Care Supplies': 'Healthcare Products',
  'Home Improvement Retail': 'Retail (Building Supply)',
  'Homefurnishing Retail': 'Retail (Special Lines)',
  'Human Resource & Employment Services': 'Business & Consumer Services',
  'Industrial Conglomerates': 'Diversified',
  'Industrial Gases': 'Chemical (Diversified)',
  'Integrated Telecommunication Services': 'Telecom. Services',
  'Interactive Home Entertainment': 'Software (Entertainment)',
  'Internet Services & Infrastructure': 'Software (Internet)',
  'Leisure Products': 'Recreation',
  'Life Sciences Tools & Services': 'Healthcare Products',
  'Metal, Glass & Plastic Containers': 'Packaging & Container',
  'Multi-Sector Holdings': 'Diversified',
  'Oil & Gas Equipment & Services': 'Oilfield Svcs/Equip.',
  'Oil & Gas Storage & Transportation': 'Oil/Gas Distribution',
  'Other Specialty Retail': 'Retail (Special Lines)',
  'Paper & Plastic Packaging Products & Materials': 'Packaging & Container',
  'Personal Care Products': 'Household Products',
  'Research & Consulting Services': 'Information Services',
  'Wireless Telecommunication Services': 'Telecom (Wireless)',
  // REITs: Damodaran's 'Retail (REITs)' is shopping-centre REITs only; the rest sit in 'R.E.I.T.'.
  'Retail REITs': 'Retail (REITs)',
  'Data Center REITs': 'R.E.I.T.',
  'Health Care REITs': 'R.E.I.T.',
  'Hotel & Resort REITs': 'R.E.I.T.',
  'Industrial REITs': 'R.E.I.T.',
  'Multi-Family Residential REITs': 'R.E.I.T.',
  'Office REITs': 'R.E.I.T.',
  'Other Specialized REITs': 'R.E.I.T.',
  'Self-Storage REITs': 'R.E.I.T.',
  'Single-Family Residential REITs': 'R.E.I.T.',
  'Telecom Tower REITs': 'R.E.I.T.',
  'Timber REITs': 'R.E.I.T.',
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
