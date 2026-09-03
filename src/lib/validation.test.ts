import { describe, expect, it } from 'vitest';
import { presetFor, subscriptionFormSchema } from './validation.js';

const base = {
  name: 'Netflix',
  amount: '17,99',
  cyclePreset: 'monthly' as const,
  firstBillingDate: '2026-01-15',
  status: 'active' as const,
};

describe('subscriptionFormSchema', () => {
  it('normalizes a monthly subscription', () => {
    const result = subscriptionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      name: 'Netflix',
      amountCents: 1799,
      cycle: 'recurring',
      intervalCount: 1,
      intervalUnit: 'month',
    });
  });

  it('expands the quarterly and yearly presets to months', () => {
    expect(subscriptionFormSchema.parse({ ...base, cyclePreset: 'quarterly' }).intervalCount).toBe(3);
    expect(subscriptionFormSchema.parse({ ...base, cyclePreset: 'yearly' }).intervalCount).toBe(12);
  });

  it('keeps a custom interval as entered', () => {
    const result = subscriptionFormSchema.parse({
      ...base,
      cyclePreset: 'custom',
      intervalCount: '45',
      intervalUnit: 'day',
    });
    expect(result).toMatchObject({ intervalCount: 45, intervalUnit: 'day', cycle: 'recurring' });
  });

  it('marks a one-time payment', () => {
    expect(subscriptionFormSchema.parse({ ...base, cyclePreset: 'one_time' }).cycle).toBe('one_time');
  });

  it('rejects an unparseable amount', () => {
    const result = subscriptionFormSchema.safeParse({ ...base, amount: 'free' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'amount')).toBe(true);
  });

  it('rejects an impossible date', () => {
    const result = subscriptionFormSchema.safeParse({ ...base, firstBillingDate: '2026-02-30' });
    expect(result.success).toBe(false);
  });

  it('rejects an end date before the start', () => {
    const result = subscriptionFormSchema.safeParse({ ...base, endDate: '2025-12-01' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'endDate')).toBe(true);
  });

  it('requires an interval for the custom preset', () => {
    const result = subscriptionFormSchema.safeParse({ ...base, cyclePreset: 'custom' });
    expect(result.success).toBe(false);
  });

  it('always gives a cancelled subscription a stop date', () => {
    const result = subscriptionFormSchema.parse({ ...base, status: 'cancelled' });
    expect(result.endDate).toBe('2026-01-15');
  });

  it('splits and trims tags', () => {
    const result = subscriptionFormSchema.parse({ ...base, tags: ' film , shared ,, ' });
    expect(result.tagNames).toEqual(['film', 'shared']);
  });

  it('defaults the notice unit to months when a count is given', () => {
    const result = subscriptionFormSchema.parse({ ...base, noticePeriodCount: '3' });
    expect(result).toMatchObject({ noticePeriodCount: 3, noticePeriodUnit: 'month' });
  });

  it('leaves optional text fields null when blank', () => {
    const result = subscriptionFormSchema.parse({ ...base, vendor: '  ', notes: '' });
    expect(result.vendor).toBeNull();
    expect(result.notes).toBeNull();
  });
});

describe('presetFor', () => {
  it('reverses the preset expansion', () => {
    expect(presetFor('recurring', 1, 'month')).toBe('monthly');
    expect(presetFor('recurring', 3, 'month')).toBe('quarterly');
    expect(presetFor('recurring', 12, 'month')).toBe('yearly');
    expect(presetFor('recurring', 45, 'day')).toBe('custom');
    expect(presetFor('one_time', 1, 'month')).toBe('one_time');
  });
});
