/** Helpers that turn stored rows into the string shapes the forms expect. */
import type { SubscriptionView } from '../db/repo.js';
import { centsToInput } from './money.js';
import { presetFor } from './validation.js';

export type FormValues = Record<string, string>;

/** Empty form defaults for a brand-new subscription. */
export function blankFormValues(today: string): FormValues {
  return {
    name: '',
    amount: '',
    cyclePreset: 'monthly',
    intervalCount: '1',
    intervalUnit: 'month',
    firstBillingDate: today,
    status: 'active',
    categoryId: '',
    endDate: '',
    noticePeriodCount: '',
    noticePeriodUnit: 'month',
    minTermCount: '',
    vendor: '',
    url: '',
    notes: '',
    tags: '',
  };
}

/** Fills the form from an existing subscription. */
export function formValuesFrom(sub: SubscriptionView): FormValues {
  return {
    name: sub.name,
    amount: centsToInput(sub.amountCents),
    cyclePreset: presetFor(sub.cycle, sub.intervalCount, sub.intervalUnit),
    intervalCount: String(sub.intervalCount),
    intervalUnit: sub.intervalUnit,
    firstBillingDate: sub.firstBillingDate,
    status: sub.status,
    categoryId: sub.categoryId === null ? '' : String(sub.categoryId),
    endDate: sub.endDate ?? '',
    noticePeriodCount: sub.noticePeriodCount === null ? '' : String(sub.noticePeriodCount),
    noticePeriodUnit: sub.noticePeriodUnit ?? 'month',
    minTermCount: sub.minTermCount === null ? '' : String(sub.minTermCount),
    vendor: sub.vendor ?? '',
    url: sub.url ?? '',
    notes: sub.notes ?? '',
    tags: sub.tags.map((tag) => tag.name).join(', '),
  };
}
