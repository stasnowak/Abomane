/**
 * Calendar helpers operating on plain ISO date strings (`YYYY-MM-DD`).
 *
 * The app deliberately avoids `Date` objects in its domain model: billing dates
 * are calendar facts, not instants, so time zones must never shift them.
 */

export type IntervalUnit = 'day' | 'week' | 'month';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const [y, m, d] = splitIso(value);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function splitIso(iso: string): [number, number, number] {
  const parts = iso.split('-');
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function makeIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

/** Number of days in a given 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtc(iso: string): Date {
  const [y, m, d] = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const dt = toUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/**
 * Adds whole months to an anchor date, clamping to the end of the target month.
 *
 * Always call this with the original anchor and a multiple, never iteratively:
 * `addMonths('2026-01-31', 2)` is `2026-03-31`, whereas adding one month twice
 * would drift to `2026-02-28` and then `2026-03-28`.
 */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = splitIso(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeIso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addInterval(iso: string, count: number, unit: IntervalUnit): string {
  switch (unit) {
    case 'month':
      return addMonths(iso, count);
    case 'week':
      return addDays(iso, count * 7);
    case 'day':
      return addDays(iso, count);
  }
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** Whole months from `a` to `b`, ignoring the day of month. */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = splitIso(a);
  const [by, bm] = splitIso(b);
  return (by - ay) * 12 + (bm - am);
}

export function todayIso(now: Date = new Date()): string {
  return makeIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface Period {
  kind: PeriodKind;
  /** First day of the period, inclusive. */
  start: string;
  /** First day *after* the period, exclusive. */
  end: string;
  /** Number of whole calendar months the period spans: 1, 3 or 12. */
  months: number;
}

export function monthsInKind(kind: PeriodKind): number {
  return kind === 'month' ? 1 : kind === 'quarter' ? 3 : 12;
}

/** Builds the period of `kind` that contains `iso`. */
export function periodContaining(kind: PeriodKind, iso: string): Period {
  const [y, m] = splitIso(iso);
  let startMonth: number;
  if (kind === 'month') startMonth = m;
  else if (kind === 'quarter') startMonth = Math.floor((m - 1) / 3) * 3 + 1;
  else startMonth = 1;

  const start = makeIso(y, startMonth, 1);
  const months = monthsInKind(kind);
  return { kind, start, end: addMonths(start, months), months };
}

/** Shifts a period by `n` whole periods (negative moves backwards). */
export function shiftPeriod(period: Period, n: number): Period {
  const start = addMonths(period.start, n * period.months);
  return { ...period, start, end: addMonths(start, period.months) };
}

/** Every calendar month start inside the period. */
export function monthStarts(period: Period): string[] {
  const out: string[] = [];
  for (let i = 0; i < period.months; i += 1) out.push(addMonths(period.start, i));
  return out;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function periodLabel(period: Period): string {
  const [y, m] = splitIso(period.start);
  if (period.kind === 'month') return `${MONTH_NAMES[m - 1]} ${y}`;
  if (period.kind === 'quarter') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  return String(y);
}

/** URL-friendly period key: `2026-09`, `2026-Q3` or `2026`. */
export function periodKey(period: Period): string {
  const [y, m] = splitIso(period.start);
  if (period.kind === 'month') return `${y}-${pad(m)}`;
  if (period.kind === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return String(y);
}

/** Parses a period key produced by {@link periodKey}. Returns null when invalid. */
export function parsePeriodKey(kind: PeriodKind, key: string): Period | null {
  if (kind === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) return null;
    const m = Number(match[2]);
    if (m < 1 || m > 12) return null;
    return periodContaining('month', makeIso(Number(match[1]), m, 1));
  }
  if (kind === 'quarter') {
    const match = /^(\d{4})-Q([1-4])$/.exec(key);
    if (!match) return null;
    const startMonth = (Number(match[2]) - 1) * 3 + 1;
    return periodContaining('quarter', makeIso(Number(match[1]), startMonth, 1));
  }
  const match = /^(\d{4})$/.exec(key);
  if (!match) return null;
  return periodContaining('year', makeIso(Number(match[1]), 1, 1));
}

/** Formats an ISO date for display, e.g. `15.03.2026`. */
export function formatDate(iso: string): string {
  const [y, m, d] = splitIso(iso);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** Formats an ISO date compactly, e.g. `15 Mar 2026`. */
export function formatDateShort(iso: string): string {
  const [y, m, d] = splitIso(iso);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}
