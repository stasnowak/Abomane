import { ActionError, defineAction } from 'astro:actions';
import { z } from 'zod';
import {
  createSubscription,
  deleteCategory,
  deleteSubscription,
  deleteTag,
  ensureTag,
  getSubscription,
  pruneOrphanTags,
  setStatus,
  updateSubscription,
  upsertCategory,
} from '../db/repo.js';
import { todayIso } from '../lib/dates.js';
import {
  categoryFormSchema,
  subscriptionFormSchema,
  type SubscriptionFormResult,
} from '../lib/validation.js';

/**
 * Raw form values, echoed back when validation fails so the user does not lose
 * what they typed. Astro discards the request body once an action has run, so
 * the values have to make the round trip through the action result.
 */
export type FormValues = Record<string, string>;

export interface FormFailure {
  ok: false;
  fieldErrors: Record<string, string>;
  values: FormValues;
}

function toValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

/**
 * Runs the subscription schema over a submitted form.
 *
 * Actions take raw `FormData` rather than letting Astro apply the Zod schema,
 * because Astro's built-in path reports validation failures without the
 * submitted values, and the form needs both to re-render usefully.
 */
function parseSubscriptionForm(
  formData: FormData,
): { ok: true; data: SubscriptionFormResult } | FormFailure {
  const values = toValues(formData);
  const parsed = subscriptionFormSchema.safeParse(values);

  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors, values };
}

/** Maps validated form output onto the database columns. */
function toRecord(data: SubscriptionFormResult) {
  return {
    name: data.name,
    vendor: data.vendor,
    url: data.url,
    notes: data.notes,
    amountCents: data.amountCents,
    categoryId: data.categoryId,
    cycle: data.cycle,
    intervalCount: data.intervalCount,
    intervalUnit: data.intervalUnit,
    firstBillingDate: data.firstBillingDate,
    endDate: data.endDate,
    status: data.status,
    pausedAt: data.pausedAt,
    noticePeriodCount: data.noticePeriodCount,
    noticePeriodUnit: data.noticePeriodUnit,
    minTermCount: data.minTermCount,
  };
}

const subscription = {
  create: defineAction({
    accept: 'form',
    input: z.instanceof(FormData),
    handler: async (formData) => {
      const parsed = parseSubscriptionForm(formData);
      if (!parsed.ok) return parsed;

      const tagIds = parsed.data.tagNames.map((name) => ensureTag(name));
      const id = createSubscription(toRecord(parsed.data), tagIds);
      return { ok: true as const, id };
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.instanceof(FormData),
    handler: async (formData) => {
      const id = Number(formData.get('id'));
      if (!Number.isInteger(id) || !getSubscription(id)) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }

      const parsed = parseSubscriptionForm(formData);
      if (!parsed.ok) return parsed;

      const tagIds = parsed.data.tagNames.map((name) => ensureTag(name));
      updateSubscription(id, toRecord(parsed.data), tagIds);
      pruneOrphanTags();
      return { ok: true as const, id };
    },
  }),

  remove: defineAction({
    accept: 'form',
    input: z.object({ id: z.coerce.number().int() }),
    handler: async ({ id }) => {
      if (!getSubscription(id)) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }
      deleteSubscription(id);
      pruneOrphanTags();
      return { ok: true as const };
    },
  }),

  setStatus: defineAction({
    accept: 'form',
    input: z.object({
      id: z.coerce.number().int(),
      status: z.enum(['active', 'paused', 'cancelled']),
    }),
    handler: async ({ id, status }) => {
      if (!getSubscription(id)) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }
      setStatus(id, status, todayIso());
      return { ok: true as const, id, status };
    },
  }),
};

const category = {
  save: defineAction({
    accept: 'form',
    input: z.instanceof(FormData),
    handler: async (formData) => {
      const parsed = categoryFormSchema.safeParse(toValues(formData));
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          fieldErrors[key] ??= issue.message;
        }
        return { ok: false as const, fieldErrors, values: toValues(formData) };
      }

      try {
        upsertCategory(parsed.data);
      } catch {
        return {
          ok: false as const,
          fieldErrors: { name: 'A category with this name already exists' },
          values: toValues(formData),
        };
      }
      return { ok: true as const };
    },
  }),

  remove: defineAction({
    accept: 'form',
    input: z.object({ id: z.coerce.number().int() }),
    handler: async ({ id }) => {
      deleteCategory(id);
      return { ok: true as const };
    },
  }),
};

const tag = {
  remove: defineAction({
    accept: 'form',
    input: z.object({ id: z.coerce.number().int() }),
    handler: async ({ id }) => {
      deleteTag(id);
      return { ok: true as const };
    },
  }),
};

export const server = { subscription, category, tag };
