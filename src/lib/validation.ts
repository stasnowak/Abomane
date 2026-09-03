import { z } from 'zod';
import { isIsoDate } from './dates.js';
import { parseEur } from './money.js';

export const CYCLE_PRESETS = ['monthly', 'quarterly', 'yearly', 'custom', 'one_time'] as const;
export type CyclePreset = (typeof CYCLE_PRESETS)[number];

export const INTERVAL_UNITS = ['day', 'week', 'month'] as const;
export const STATUSES = ['active', 'paused', 'cancelled'] as const;

const isoDate = z.string().refine(isIsoDate, { message: 'Enter a valid date' });

const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  });

const optionalIsoDate = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  })
  .refine((value) => value === null || isIsoDate(value), { message: 'Enter a valid date' });

const optionalPositiveInt = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : Number(trimmed);
  })
  .refine((value) => value === null || (Number.isInteger(value) && value > 0), {
    message: 'Enter a whole number greater than zero',
  });

/**
 * Validates the subscription form.
 *
 * The form speaks in presets (Monthly, Quarterly, Yearly, Custom, One-time)
 * while storage speaks in count plus unit. The conversion happens here so the
 * rest of the app only ever sees the normalized form.
 */
export const subscriptionFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
    vendor: optionalText,
    url: optionalText,
    notes: optionalText,

    amount: z.string().min(1, 'Amount is required'),
    categoryId: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? '';
        return trimmed === '' ? null : Number(trimmed);
      })
      .refine((value) => value === null || Number.isInteger(value), { message: 'Invalid category' }),

    cyclePreset: z.enum(CYCLE_PRESETS),
    intervalCount: z.string().optional(),
    intervalUnit: z.enum(INTERVAL_UNITS).optional(),

    firstBillingDate: isoDate,
    endDate: optionalIsoDate,
    status: z.enum(STATUSES).default('active'),

    noticePeriodCount: optionalPositiveInt,
    noticePeriodUnit: z.enum(INTERVAL_UNITS).optional(),
    minTermCount: optionalPositiveInt,

    tags: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag !== ''),
      ),
  })
  .superRefine((data, ctx) => {
    if (parseEur(data.amount) === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount like 12,99' });
    } else if (parseEur(data.amount)! < 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount cannot be negative' });
    }

    if (data.cyclePreset === 'custom') {
      const count = Number(data.intervalCount ?? '');
      if (!Number.isInteger(count) || count <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['intervalCount'],
          message: 'Enter how many days, weeks or months between charges',
        });
      }
      if (!data.intervalUnit) {
        ctx.addIssue({ code: 'custom', path: ['intervalUnit'], message: 'Choose a unit' });
      }
    }

    if (data.endDate && data.endDate < data.firstBillingDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'The end date cannot be before the first billing date',
      });
    }
  })
  .transform((data) => {
    const preset = data.cyclePreset;
    const cycle = preset === 'one_time' ? ('one_time' as const) : ('recurring' as const);

    let intervalCount = 1;
    let intervalUnit: (typeof INTERVAL_UNITS)[number] = 'month';
    if (preset === 'quarterly') intervalCount = 3;
    else if (preset === 'yearly') intervalCount = 12;
    else if (preset === 'custom') {
      intervalCount = Number(data.intervalCount);
      intervalUnit = data.intervalUnit ?? 'month';
    }

    // A cancelled subscription needs a hard stop date, otherwise the schedule
    // maths would keep projecting charges past the cancellation.
    const endDate =
      data.status === 'cancelled' ? (data.endDate ?? data.firstBillingDate) : data.endDate;

    return {
      name: data.name,
      vendor: data.vendor,
      url: data.url,
      notes: data.notes,
      amountCents: parseEur(data.amount) ?? 0,
      categoryId: data.categoryId,
      cycle,
      intervalCount,
      intervalUnit,
      firstBillingDate: data.firstBillingDate,
      endDate,
      status: data.status,
      pausedAt: data.status === 'paused' ? (data.endDate ?? data.firstBillingDate) : null,
      noticePeriodCount: data.noticePeriodCount,
      noticePeriodUnit: data.noticePeriodCount ? (data.noticePeriodUnit ?? 'month') : null,
      minTermCount: data.minTermCount,
      tagNames: data.tags,
    };
  });

export type SubscriptionFormResult = z.output<typeof subscriptionFormSchema>;

/** Maps stored interval fields back to the preset the form shows. */
export function presetFor(cycle: string, count: number, unit: string): CyclePreset {
  if (cycle === 'one_time') return 'one_time';
  if (unit === 'month') {
    if (count === 1) return 'monthly';
    if (count === 3) return 'quarterly';
    if (count === 12) return 'yearly';
  }
  return 'custom';
}

export const categoryFormSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? undefined : Number(trimmed);
    }),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
  color: z.string().trim().min(1),
});
