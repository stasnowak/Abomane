import { describe, expect, it } from 'vitest';
import {
  addDays,
  addInterval,
  addMonths,
  daysBetween,
  daysInMonth,
  isIsoDate,
  monthsBetween,
  parsePeriodKey,
  periodContaining,
  periodKey,
  periodLabel,
  shiftPeriod,
} from './dates.js';

describe('addMonths', () => {
  it('clamps the 31st to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('keeps the anchor day when the target month is long enough', () => {
    // The crucial property: adding 2 months to the anchor returns to the 31st,
    // which iterative month-by-month addition would have lost.
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-01-31', 12)).toBe('2027-01-31');
  });

  it('rolls over year boundaries', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-15', -3)).toBe('2025-11-15');
  });
});

describe('addDays and addInterval', () => {
  it('crosses leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('dispatches on unit', () => {
    expect(addInterval('2026-01-01', 45, 'day')).toBe('2026-02-15');
    expect(addInterval('2026-01-01', 2, 'week')).toBe('2026-01-15');
    expect(addInterval('2026-01-01', 12, 'month')).toBe('2027-01-01');
  });
});

describe('differences', () => {
  it('counts days and months', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
    expect(monthsBetween('2026-01-15', '2027-03-01')).toBe(14);
  });
});

describe('validation', () => {
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-2-01')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('periods', () => {
  it('builds the containing period', () => {
    expect(periodContaining('month', '2026-09-17').start).toBe('2026-09-01');
    expect(periodContaining('quarter', '2026-09-17').start).toBe('2026-07-01');
    expect(periodContaining('quarter', '2026-09-17').end).toBe('2026-10-01');
    expect(periodContaining('year', '2026-09-17').start).toBe('2026-01-01');
    expect(periodContaining('year', '2026-09-17').end).toBe('2027-01-01');
  });

  it('shifts by whole periods', () => {
    const q = periodContaining('quarter', '2026-09-17');
    expect(shiftPeriod(q, 1).start).toBe('2026-10-01');
    expect(shiftPeriod(q, -3).start).toBe('2025-10-01');
  });

  it('labels and round-trips keys', () => {
    const m = periodContaining('month', '2026-09-17');
    expect(periodLabel(m)).toBe('September 2026');
    expect(periodKey(m)).toBe('2026-09');
    expect(parsePeriodKey('month', '2026-09')?.start).toBe('2026-09-01');

    const q = periodContaining('quarter', '2026-09-17');
    expect(periodLabel(q)).toBe('Q3 2026');
    expect(periodKey(q)).toBe('2026-Q3');
    expect(parsePeriodKey('quarter', '2026-Q3')?.start).toBe('2026-07-01');

    expect(periodKey(periodContaining('year', '2026-09-17'))).toBe('2026');
    expect(parsePeriodKey('year', '2026')?.start).toBe('2026-01-01');
  });

  it('returns null for malformed keys', () => {
    expect(parsePeriodKey('month', '2026-13')).toBeNull();
    expect(parsePeriodKey('quarter', '2026-Q5')).toBeNull();
    expect(parsePeriodKey('year', 'nope')).toBeNull();
  });
});
