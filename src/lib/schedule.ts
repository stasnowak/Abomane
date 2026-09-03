/**
 * Billing schedule and cost maths.
 *
 * Every function here is pure and works on plain ISO date strings, so the whole
 * cost model is unit-testable without a database or a clock.
 *
 * All cycles share one representation: an `intervalCount` plus an
 * `intervalUnit`. Monthly is `1 month`, quarterly `3 month`, yearly `12 month`,
 * and anything unusual is expressed in days, weeks or months directly. That
 * keeps a single code path for every schedule calculation.
 */

import {
  addDays,
  addInterval,
  addMonths,
  daysBetween,
  maxIso,
  minIso,
  monthStarts,
  monthsBetween,
  type IntervalUnit,
  type Period,
} from './dates.js';

export type Cycle = 'recurring' | 'one_time';
export type Status = 'active' | 'paused' | 'cancelled';
export type CostMode = 'normalized' | 'actual';

/** The minimum shape the schedule maths needs. Database rows satisfy it. */
export interface Billable {
  amountCents: number;
  cycle: Cycle;
  intervalCount: number;
  intervalUnit: IntervalUnit;
  firstBillingDate: string;
  endDate: string | null;
  status: Status;
  pausedAt: string | null;
  noticePeriodCount?: number | null;
  noticePeriodUnit?: IntervalUnit | null;
  minTermCount?: number | null;
}

/** Average days in a month across a 4-year cycle, used to normalize day/week intervals. */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * The last date on which this subscription may still be charged, or null when
 * it runs indefinitely.
 *
 * A paused subscription stops at its pause date; a cancelled one at its end
 * date. Both fall back defensively so a row with missing dates can never
 * produce an unbounded stream of future charges.
 */
export function lastChargeDate(sub: Billable): string | null {
  if (sub.status === 'cancelled') {
    return sub.endDate ?? sub.pausedAt ?? sub.firstBillingDate;
  }
  if (sub.status === 'paused') {
    return sub.pausedAt ?? sub.endDate ?? sub.firstBillingDate;
  }
  return sub.endDate;
}

/** The date of the k-th charge, counting the first billing date as k = 0. */
export function occurrenceAt(sub: Billable, k: number): string {
  const count = Math.max(1, Math.trunc(sub.intervalCount));
  return addInterval(sub.firstBillingDate, count * k, sub.intervalUnit);
}

/**
 * Index of the first charge falling on or after `from`.
 *
 * Seeds the search with an arithmetic estimate so a daily subscription queried
 * decades later still resolves in a handful of steps.
 */
function indexAtOrAfter(sub: Billable, from: string): number | null {
  const anchor = sub.firstBillingDate;
  if (from <= anchor) return 0;

  const count = Math.max(1, Math.trunc(sub.intervalCount));
  let k: number;
  if (sub.intervalUnit === 'month') {
    k = Math.floor(monthsBetween(anchor, from) / count) - 1;
  } else {
    const perStep = sub.intervalUnit === 'week' ? count * 7 : count;
    k = Math.floor(daysBetween(anchor, from) / perStep) - 1;
  }
  k = Math.max(0, k);

  for (let i = 0; i < 2000; i += 1) {
    if (occurrenceAt(sub, k) >= from) return k;
    k += 1;
  }
  return null;
}

/**
 * Every charge date in the half-open range `[start, end)`, honouring pause and
 * end dates. A one-time payment yields at most its single date.
 */
export function occurrencesInRange(sub: Billable, start: string, end: string): string[] {
  if (start >= end) return [];

  const last = lastChargeDate(sub);
  const hardEnd = last ? minIso(end, addDays(last, 1)) : end;
  if (start >= hardEnd) return [];

  if (sub.cycle === 'one_time') {
    const at = sub.firstBillingDate;
    return at >= start && at < hardEnd ? [at] : [];
  }

  let k = indexAtOrAfter(sub, maxIso(start, sub.firstBillingDate));
  if (k === null) return [];

  const out: string[] = [];
  while (out.length < 2000) {
    const occ = occurrenceAt(sub, k);
    if (occ >= hardEnd) break;
    out.push(occ);
    k += 1;
  }
  return out;
}

/** The next charge on or after `from`, or null when none remains. */
export function nextBillingDate(sub: Billable, from: string): string | null {
  const last = lastChargeDate(sub);

  if (sub.cycle === 'one_time') {
    const at = sub.firstBillingDate;
    if (at < from) return null;
    if (last && at > last) return null;
    return at;
  }

  const k = indexAtOrAfter(sub, from);
  if (k === null) return null;
  const occ = occurrenceAt(sub, k);
  if (last && occ > last) return null;
  return occ;
}

/**
 * Cost of this subscription averaged over one month.
 *
 * One-time payments contribute nothing: they are real cash out, but they are
 * not a recurring commitment, so folding them into a monthly average would
 * misrepresent the ongoing burn. They still appear in `actual` mode.
 */
export function normalizedMonthlyCents(sub: Billable): number {
  if (sub.cycle === 'one_time') return 0;
  const count = Math.max(1, Math.trunc(sub.intervalCount));
  if (sub.intervalUnit === 'month') return sub.amountCents / count;
  const days = sub.intervalUnit === 'week' ? count * 7 : count;
  return (sub.amountCents * DAYS_PER_MONTH) / days;
}

/** Whether the subscription's billing window overlaps the given month. */
function activeInMonth(sub: Billable, monthStart: string): boolean {
  const monthEnd = addMonths(monthStart, 1);
  if (sub.firstBillingDate >= monthEnd) return false;
  const last = lastChargeDate(sub);
  if (last && last < monthStart) return false;
  return true;
}

export interface SubscriptionRow<T extends Billable> {
  subscription: T;
  /** Rounded cents attributed to the period. */
  cents: number;
  /** Charge dates inside the period. Only populated in `actual` mode. */
  dates: string[];
}

export interface CategoryTotal {
  categoryId: number | null;
  name: string;
  color: string;
  cents: number;
}

export interface PeriodTotals<T extends Billable> {
  totalCents: number;
  rows: Array<SubscriptionRow<T>>;
  byCategory: CategoryTotal[];
}

/** Optional category fields a row may carry, used only for the breakdown. */
export interface WithCategory {
  categoryId?: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
}

/**
 * Totals for a period.
 *
 * - `normalized` spreads each recurring cost evenly across the months it is
 *   active, so a yearly subscription shows as one twelfth per month. Use it to
 *   answer "what do my subscriptions cost me per month".
 * - `actual` counts only charges that really land inside the period. Use it for
 *   cash flow, and to see the spikes that normalizing hides.
 */
export function periodTotals<T extends Billable & WithCategory>(
  subs: readonly T[],
  period: Period,
  mode: CostMode,
): PeriodTotals<T> {
  const months = monthStarts(period);

  const rows: Array<SubscriptionRow<T>> = [];
  for (const sub of subs) {
    if (mode === 'actual') {
      const dates = occurrencesInRange(sub, period.start, period.end);
      if (dates.length === 0) continue;
      rows.push({ subscription: sub, cents: dates.length * sub.amountCents, dates });
      continue;
    }

    let cents = 0;
    for (const monthStart of months) {
      if (activeInMonth(sub, monthStart)) cents += normalizedMonthlyCents(sub);
    }
    const rounded = Math.round(cents);
    if (rounded === 0) continue;
    rows.push({ subscription: sub, cents: rounded, dates: [] });
  }

  rows.sort((a, b) => b.cents - a.cents || a.subscription.amountCents - b.subscription.amountCents);

  const totalCents = rows.reduce((sum, row) => sum + row.cents, 0);

  const buckets = new Map<string, CategoryTotal>();
  for (const row of rows) {
    const id = row.subscription.categoryId ?? null;
    const key = String(id);
    const existing = buckets.get(key);
    if (existing) {
      existing.cents += row.cents;
    } else {
      buckets.set(key, {
        categoryId: id,
        name: row.subscription.categoryName ?? 'Uncategorized',
        color: row.subscription.categoryColor ?? 'slate',
        cents: row.cents,
      });
    }
  }
  const byCategory = [...buckets.values()].sort((a, b) => b.cents - a.cents);

  return { totalCents, rows, byCategory };
}

export interface CancelDeadline {
  /** Last day to give notice. */
  deadline: string;
  /** The renewal that giving notice by `deadline` avoids. */
  renewal: string;
  /** Days from `asOf` until the deadline. Negative means it has passed. */
  daysLeft: number;
}

/**
 * The next date by which notice must be given to avoid a renewal.
 *
 * Respects a minimum contract term: renewals that fall inside the minimum term
 * cannot be avoided, so the first escapable renewal is the one on or after
 * `firstBillingDate + minTerm`. Returns null when no notice period is recorded,
 * for one-time payments, and for subscriptions already cancelled.
 */
export function cancelByDate(sub: Billable, asOf: string): CancelDeadline | null {
  const noticeCount = sub.noticePeriodCount ?? 0;
  const noticeUnit = sub.noticePeriodUnit ?? null;
  if (noticeCount <= 0 || !noticeUnit) return null;
  if (sub.cycle === 'one_time') return null;
  if (sub.status === 'cancelled') return null;

  const minTerm = sub.minTermCount ?? 0;
  const earliestEnd = minTerm > 0 ? addMonths(sub.firstBillingDate, minTerm) : sub.firstBillingDate;
  const searchFrom = maxIso(asOf, earliestEnd);
  const last = lastChargeDate(sub);

  let k = indexAtOrAfter(sub, searchFrom);
  if (k === null) return null;

  for (let i = 0; i < 240; i += 1, k += 1) {
    const renewal = occurrenceAt(sub, k);
    if (last && renewal > last) return null;
    const deadline = addInterval(renewal, -noticeCount, noticeUnit);
    if (deadline >= asOf) {
      return { deadline, renewal, daysLeft: daysBetween(asOf, deadline) };
    }
  }
  return null;
}

/** Human label for a billing cycle, e.g. `Yearly` or `Every 45 days`. */
export function cycleLabel(sub: Billable): string {
  if (sub.cycle === 'one_time') return 'One-time';
  const count = Math.max(1, Math.trunc(sub.intervalCount));
  if (sub.intervalUnit === 'month') {
    if (count === 1) return 'Monthly';
    if (count === 3) return 'Quarterly';
    if (count === 6) return 'Half-yearly';
    if (count === 12) return 'Yearly';
    return `Every ${count} months`;
  }
  if (sub.intervalUnit === 'week') {
    return count === 1 ? 'Weekly' : `Every ${count} weeks`;
  }
  return count === 1 ? 'Daily' : `Every ${count} days`;
}
