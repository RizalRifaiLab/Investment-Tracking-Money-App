export const MAX_MONTHS = 720;

/**
 * Months until `start` reaches `target`, compounding monthly at `annualPct` with `monthly` added each month.
 * 0 = already reached, MAX_MONTHS = "60+ yrs".
 * shortcut: float maths — fine for an estimate, never use for stored money.
 */
export function monthsTo(start: number, target: number, monthly: number, annualPct: number): number {
  const r = annualPct / 100 / 12;
  let v = start, n = 0;
  while (v < target && n < MAX_MONTHS) { v = v * (1 + r) + monthly; n++; }
  return n;
}

/** Net-worth path for the projection chart: [start, month1, …, monthN]. */
export function projectPath(start: number, months: number, monthly: number, annualPct: number): number[] {
  const r = annualPct / 100 / 12;
  const out = [start];
  for (let i = 0; i < months; i++) out.push(out[i] * (1 + r) + monthly);
  return out;
}

/** First day of the month the goal is reached, or null if already reached / beyond MAX_MONTHS. */
export function etaDate(months: number, now = new Date()): Date | null {
  if (months === 0 || months >= MAX_MONTHS) return null;
  return new Date(now.getFullYear(), now.getMonth() + months, 1);
}
