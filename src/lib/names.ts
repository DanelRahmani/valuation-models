/** "COCA-COLA CO" / "Coca-Cola Company (The)" -> "Coca-Cola". Display only. */
export function prettyName(raw: string): string {
  let s = raw.replace(/\s*\(The\)\s*$/i, '').replace(/^The\s+/i, '');
  s = s.replace(/[,.]?\s+(Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Plc|Holdings|N\.?V|S\.?A|Group)\.?$/i, '');
  s = s.replace(/[,.]?\s+(Inc|Corp|Co|Company)\.?$/i, '');
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return s.replace(/\bNvidia\b/, 'NVIDIA').replace(/\bPepsico\b/, 'PepsiCo').replace(/\bIbm\b/, 'IBM').replace(/\bAt&t\b/i, 'AT&T').trim();
}
