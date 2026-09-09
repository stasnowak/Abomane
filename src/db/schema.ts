import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Colour tokens map to a fixed Tailwind palette; see `src/lib/colors.ts`. */
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('slate'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    vendor: text('vendor'),
    url: text('url'),
    notes: text('notes'),

    /** Integer euro cents. The app is single-currency by design. */
    amountCents: integer('amount_cents').notNull(),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),

    cycle: text('cycle', { enum: ['recurring', 'one_time'] })
      .notNull()
      .default('recurring'),
    /**
     * Every cycle is stored as a count plus a unit, so monthly is `1 month`,
     * quarterly `3 month` and yearly `12 month`. One code path, no special cases.
     */
    intervalCount: integer('interval_count').notNull().default(1),
    intervalUnit: text('interval_unit', { enum: ['day', 'week', 'month'] })
      .notNull()
      .default('month'),

    /** Anchor date. All later charges are computed as offsets from this day. */
    firstBillingDate: text('first_billing_date').notNull(),
    endDate: text('end_date'),

    status: text('status', { enum: ['active', 'paused', 'cancelled'] })
      .notNull()
      .default('active'),
    pausedAt: text('paused_at'),

    noticePeriodCount: integer('notice_period_count'),
    noticePeriodUnit: text('notice_period_unit', { enum: ['day', 'week', 'month'] }),
    /** Minimum contract term, in months. */
    minTermCount: integer('min_term_count'),

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_category_idx').on(table.categoryId),
  ],
);

export const subscriptionTags = sqliteTable(
  'subscription_tags',
  {
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.subscriptionId, table.tagId] })],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  category: one(categories, {
    fields: [subscriptions.categoryId],
    references: [categories.id],
  }),
  subscriptionTags: many(subscriptionTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  subscriptionTags: many(subscriptionTags),
}));

export const subscriptionTagsRelations = relations(subscriptionTags, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionTags.subscriptionId],
    references: [subscriptions.id],
  }),
  tag: one(tags, {
    fields: [subscriptionTags.tagId],
    references: [tags.id],
  }),
}));

export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type NewSubscriptionRecord = typeof subscriptions.$inferInsert;
