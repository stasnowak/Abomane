import { describe, expect, it } from 'vitest';
import { periodContaining } from './dates.js';
import { bucketsFor, overviewHref, parseOverviewQuery } from './query.js';

const today = '2026-09-17';

function query(search: string) {
  return parseOverviewQuery(new URLSearchParams(search), today);
}

describe('parseOverviewQuery', () => {
  it('defaults to the current month, normalized', () => {
    const result = query('');
    expect(result.kind).toBe('month');
    expect(result.mode).toBe('normalized');
    expect(result.period.start).toBe('2026-09-01');
  });

  it('reads an explicit view, period and mode', () => {
    const result = query('view=quarter&period=2026-Q1&mode=actual');
    expect(result.kind).toBe('quarter');
    expect(result.mode).toBe('actual');
    expect(result.period.start).toBe('2026-01-01');
  });

  it('falls back to defaults for unknown values', () => {
    const result = query('view=fortnight&mode=sideways&period=banana');
    expect(result.kind).toBe('month');
    expect(result.mode).toBe('normalized');
    expect(result.period.start).toBe('2026-09-01');
  });

  it('falls back when the period does not match the view', () => {
    // A quarter key cannot be read as a month, so the current month wins.
    expect(query('view=month&period=2026-Q3').period.start).toBe('2026-09-01');
  });
});

describe('overviewHref', () => {
  it('keeps the point in time when switching view', () => {
    const current = query('view=month&period=2026-09&mode=actual');
    expect(overviewHref(current, { kind: 'quarter' })).toBe(
      '/?view=quarter&period=2026-Q3&mode=actual',
    );
  });

  it('changes only the mode when asked', () => {
    const current = query('view=year&period=2026&mode=normalized');
    expect(overviewHref(current, { mode: 'actual' })).toBe('/?view=year&period=2026&mode=actual');
  });

  it('moves to another period', () => {
    const current = query('');
    const october = periodContaining('month', '2026-10-01');
    expect(overviewHref(current, { period: october })).toBe(
      '/?view=month&period=2026-10&mode=normalized',
    );
  });
});

describe('bucketsFor', () => {
  it('gives twelve months of the year', () => {
    const buckets = bucketsFor(periodContaining('month', '2026-09-01'));
    expect(buckets).toHaveLength(12);
    expect(buckets[0]?.start).toBe('2026-01-01');
    expect(buckets[11]?.start).toBe('2026-12-01');
  });

  it('gives four quarters of the year', () => {
    const buckets = bucketsFor(periodContaining('quarter', '2026-09-01'));
    expect(buckets.map((bucket) => bucket.start)).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);
  });

  it('gives five years ending with the selected one', () => {
    const buckets = bucketsFor(periodContaining('year', '2026-01-01'));
    expect(buckets.map((bucket) => bucket.start)).toEqual([
      '2022-01-01',
      '2023-01-01',
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ]);
  });
});
