import { describe, expect, it } from 'vitest';
import { periodContaining } from './dates.js';
import {
  cancelByDate,
  cycleLabel,
  nextBillingDate,
  normalizedMonthlyCents,
  occurrencesInRange,
  periodTotals,
  type Billable,
} from './schedule.js';

function sub(overrides: Partial<Billable> = {}): Billable {
  return {
    amountCents: 1000,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: '2026-01-15',
    endDate: null,
    status: 'active',
    pausedAt: null,
    ...overrides,
  };
}

describe('occurrencesInRange', () => {
  it('lists monthly charges anchored to the 31st without drifting', () => {
    const s = sub({ firstBillingDate: '2026-01-31' });
    expect(occurrencesInRange(s, '2026-01-01', '2026-05-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('places quarterly charges every third month from the anchor', () => {
    const s = sub({ intervalCount: 3, firstBillingDate: '2026-01-15' });
    expect(occurrencesInRange(s, '2026-01-01', '2027-01-01')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });

  it('handles a custom 45-day interval', () => {
    const s = sub({ intervalCount: 45, intervalUnit: 'day', firstBillingDate: '2026-01-01' });
    expect(occurrencesInRange(s, '2026-01-01', '2026-06-01')).toEqual([
      '2026-01-01',
      '2026-02-15',
      '2026-04-01',
      '2026-05-16',
    ]);
  });

  it('includes a one-time payment only inside its own range', () => {
    const s = sub({ cycle: 'one_time', firstBillingDate: '2026-03-10' });
    expect(occurrencesInRange(s, '2026-03-01', '2026-04-01')).toEqual(['2026-03-10']);
    expect(occurrencesInRange(s, '2026-04-01', '2026-05-01')).toEqual([]);
  });

  it('returns nothing for an inverted range', () => {
    expect(occurrencesInRange(sub(), '2026-05-01', '2026-01-01')).toEqual([]);
  });

  it('stops at the pause date', () => {
    const s = sub({ status: 'paused', pausedAt: '2026-03-20' });
    expect(occurrencesInRange(s, '2026-01-01', '2026-07-01')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('stops at the cancellation end date', () => {
    const s = sub({ status: 'cancelled', endDate: '2026-04-15' });
    expect(occurrencesInRange(s, '2026-01-01', '2026-07-01')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('honours a future end date on an active subscription', () => {
    const s = sub({ endDate: '2026-03-01' });
    expect(occurrencesInRange(s, '2026-01-01', '2026-07-01')).toEqual(['2026-01-15', '2026-02-15']);
  });

  it('resolves far-future ranges without walking every step', () => {
    const s = sub({ intervalCount: 1, intervalUnit: 'day', firstBillingDate: '2000-01-01' });
    expect(occurrencesInRange(s, '2026-09-01', '2026-09-04')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });
});

describe('nextBillingDate', () => {
  it('finds the next charge on or after a date', () => {
    expect(nextBillingDate(sub(), '2026-02-16')).toBe('2026-03-15');
    expect(nextBillingDate(sub(), '2026-01-15')).toBe('2026-01-15');
  });

  it('returns null once the subscription has ended', () => {
    expect(
      nextBillingDate(sub({ status: 'cancelled', endDate: '2026-03-15' }), '2026-04-01'),
    ).toBeNull();
  });

  it('handles a one-time payment already in the past', () => {
    const s = sub({ cycle: 'one_time', firstBillingDate: '2026-01-05' });
    expect(nextBillingDate(s, '2026-02-01')).toBeNull();
    expect(nextBillingDate(s, '2026-01-01')).toBe('2026-01-05');
  });
});

describe('normalizedMonthlyCents', () => {
  it('divides recurring cost down to one month', () => {
    expect(normalizedMonthlyCents(sub({ amountCents: 12000, intervalCount: 12 }))).toBe(1000);
    expect(normalizedMonthlyCents(sub({ amountCents: 3000, intervalCount: 3 }))).toBe(1000);
    expect(normalizedMonthlyCents(sub({ amountCents: 999, intervalCount: 1 }))).toBe(999);
  });

  it('converts weekly and daily intervals via average month length', () => {
    const weekly = normalizedMonthlyCents(
      sub({ amountCents: 100, intervalCount: 1, intervalUnit: 'week' }),
    );
    expect(weekly).toBeCloseTo((100 * 365.25) / 12 / 7, 6);
  });

  it('excludes one-time payments from the recurring average', () => {
    expect(normalizedMonthlyCents(sub({ cycle: 'one_time', amountCents: 50000 }))).toBe(0);
  });
});

describe('periodTotals', () => {
  const yearly = sub({ amountCents: 12000, intervalCount: 12, firstBillingDate: '2026-03-10' });
  const monthly = sub({ amountCents: 999, firstBillingDate: '2026-01-05' });

  it('shows a yearly charge only in its own month in actual mode', () => {
    const march = periodTotals([yearly], periodContaining('month', '2026-03-01'), 'actual');
    expect(march.totalCents).toBe(12000);

    const april = periodTotals([yearly], periodContaining('month', '2026-04-01'), 'actual');
    expect(april.totalCents).toBe(0);
    expect(april.rows).toHaveLength(0);
  });

  it('spreads a yearly charge across every month in normalized mode', () => {
    const april = periodTotals([yearly], periodContaining('month', '2026-04-01'), 'normalized');
    expect(april.totalCents).toBe(1000);
  });

  it('agrees with actual totals over a full year for monthly subscriptions', () => {
    const year = periodContaining('year', '2027-01-01');
    const normalized = periodTotals([monthly], year, 'normalized').totalCents;
    const actual = periodTotals([monthly], year, 'actual').totalCents;
    expect(normalized).toBe(actual);
    expect(actual).toBe(999 * 12);
  });

  it('counts a one-time payment in actual mode only', () => {
    const once = sub({ cycle: 'one_time', amountCents: 25000, firstBillingDate: '2026-05-20' });
    const may = periodContaining('month', '2026-05-01');
    expect(periodTotals([once], may, 'actual').totalCents).toBe(25000);
    expect(periodTotals([once], may, 'normalized').totalCents).toBe(0);
  });

  it('excludes months before the subscription starts', () => {
    const q1 = periodContaining('quarter', '2026-01-01');
    // Starts 10 March, so only March contributes in Q1.
    expect(periodTotals([yearly], q1, 'normalized').totalCents).toBe(1000);
  });

  it('groups by category and sorts rows by cost', () => {
    const a = { ...monthly, categoryId: 1, categoryName: 'Streaming', categoryColor: 'violet' };
    const b = { ...yearly, categoryId: 1, categoryName: 'Streaming', categoryColor: 'violet' };
    const c = {
      ...sub({ amountCents: 5000 }),
      categoryId: 2,
      categoryName: 'Software',
      categoryColor: 'blue',
    };

    const totals = periodTotals([a, b, c], periodContaining('month', '2026-06-01'), 'normalized');
    expect(totals.rows[0]?.subscription.amountCents).toBe(5000);
    expect(totals.byCategory).toEqual([
      { categoryId: 2, name: 'Software', color: 'blue', cents: 5000 },
      { categoryId: 1, name: 'Streaming', color: 'violet', cents: 1999 },
    ]);
  });

  it('falls back to an uncategorized bucket', () => {
    const totals = periodTotals([monthly], periodContaining('month', '2026-06-01'), 'normalized');
    expect(totals.byCategory[0]?.name).toBe('Uncategorized');
  });
});

describe('cancelByDate', () => {
  it('applies a 3-month notice period to a yearly contract', () => {
    const s = sub({
      intervalCount: 12,
      firstBillingDate: '2026-01-01',
      noticePeriodCount: 3,
      noticePeriodUnit: 'month',
    });
    const result = cancelByDate(s, '2026-06-01');
    expect(result).not.toBeNull();
    expect(result?.renewal).toBe('2027-01-01');
    expect(result?.deadline).toBe('2026-10-01');
  });

  it('skips a renewal whose deadline has already passed', () => {
    const s = sub({
      intervalCount: 12,
      firstBillingDate: '2026-01-01',
      noticePeriodCount: 3,
      noticePeriodUnit: 'month',
    });
    // Past the 2027 deadline, so the next escapable renewal is 2028.
    const result = cancelByDate(s, '2026-11-01');
    expect(result?.renewal).toBe('2028-01-01');
    expect(result?.deadline).toBe('2027-10-01');
  });

  it('cannot escape a renewal inside the minimum term', () => {
    const s = sub({
      intervalCount: 12,
      firstBillingDate: '2026-01-01',
      noticePeriodCount: 3,
      noticePeriodUnit: 'month',
      minTermCount: 24,
    });
    const result = cancelByDate(s, '2026-02-01');
    // The 2027 renewal falls inside the 24-month term, so 2028 is the first exit.
    expect(result?.renewal).toBe('2028-01-01');
    expect(result?.deadline).toBe('2027-10-01');
  });

  it('reports days remaining', () => {
    const s = sub({
      intervalCount: 12,
      firstBillingDate: '2026-01-01',
      noticePeriodCount: 1,
      noticePeriodUnit: 'month',
    });
    expect(cancelByDate(s, '2026-12-01')?.daysLeft).toBe(0);
  });

  it('returns null without a notice period, for one-time payments and when cancelled', () => {
    expect(cancelByDate(sub(), '2026-01-01')).toBeNull();
    expect(
      cancelByDate(
        sub({ cycle: 'one_time', noticePeriodCount: 1, noticePeriodUnit: 'month' }),
        '2026-01-01',
      ),
    ).toBeNull();
    expect(
      cancelByDate(
        sub({
          status: 'cancelled',
          endDate: '2026-05-01',
          noticePeriodCount: 1,
          noticePeriodUnit: 'month',
        }),
        '2026-01-01',
      ),
    ).toBeNull();
  });
});

describe('cycleLabel', () => {
  it('names the common presets', () => {
    expect(cycleLabel(sub({ intervalCount: 1 }))).toBe('Monthly');
    expect(cycleLabel(sub({ intervalCount: 3 }))).toBe('Quarterly');
    expect(cycleLabel(sub({ intervalCount: 12 }))).toBe('Yearly');
    expect(cycleLabel(sub({ cycle: 'one_time' }))).toBe('One-time');
    expect(cycleLabel(sub({ intervalCount: 45, intervalUnit: 'day' }))).toBe('Every 45 days');
    expect(cycleLabel(sub({ intervalCount: 2, intervalUnit: 'week' }))).toBe('Every 2 weeks');
  });
});
