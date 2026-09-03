import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { getDb, type Db } from './client.js';
import {
  categories,
  subscriptionTags,
  subscriptions,
  tags,
  type CategoryRow,
  type NewSubscriptionRecord,
  type SubscriptionRecord,
  type TagRow,
} from './schema.js';

/** A subscription with its category and tags resolved, ready for rendering. */
export interface SubscriptionView extends SubscriptionRecord {
  categoryName: string | null;
  categoryColor: string | null;
  tags: TagRow[];
}

export interface SubscriptionFilter {
  status?: 'active' | 'paused' | 'cancelled' | 'all';
  categoryId?: number | null;
  tagId?: number;
  search?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Attaches tags to rows in one extra query rather than N. */
function withTags(db: Db, rows: Omit<SubscriptionView, 'tags'>[]): SubscriptionView[] {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const links = db
    .select({
      subscriptionId: subscriptionTags.subscriptionId,
      id: tags.id,
      name: tags.name,
    })
    .from(subscriptionTags)
    .innerJoin(tags, eq(subscriptionTags.tagId, tags.id))
    .where(inArray(subscriptionTags.subscriptionId, ids))
    .orderBy(asc(tags.name))
    .all();

  const byId = new Map<number, TagRow[]>();
  for (const link of links) {
    const list = byId.get(link.subscriptionId) ?? [];
    list.push({ id: link.id, name: link.name });
    byId.set(link.subscriptionId, list);
  }

  return rows.map((row) => ({ ...row, tags: byId.get(row.id) ?? [] }));
}

export function listSubscriptions(
  filter: SubscriptionFilter = {},
  db: Db = getDb(),
): SubscriptionView[] {
  const conditions = [];

  if (filter.status && filter.status !== 'all') {
    conditions.push(eq(subscriptions.status, filter.status));
  }
  if (filter.categoryId !== undefined) {
    conditions.push(
      filter.categoryId === null
        ? sql`${subscriptions.categoryId} is null`
        : eq(subscriptions.categoryId, filter.categoryId),
    );
  }
  if (filter.search && filter.search.trim() !== '') {
    const needle = `%${filter.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${subscriptions.name})`, needle),
        like(sql`lower(coalesce(${subscriptions.vendor}, ''))`, needle),
        like(sql`lower(coalesce(${subscriptions.notes}, ''))`, needle),
      )!,
    );
  }
  if (filter.tagId !== undefined) {
    conditions.push(
      sql`exists (select 1 from ${subscriptionTags} st where st.subscription_id = ${subscriptions.id} and st.tag_id = ${filter.tagId})`,
    );
  }

  const rows = db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      vendor: subscriptions.vendor,
      url: subscriptions.url,
      notes: subscriptions.notes,
      amountCents: subscriptions.amountCents,
      categoryId: subscriptions.categoryId,
      cycle: subscriptions.cycle,
      intervalCount: subscriptions.intervalCount,
      intervalUnit: subscriptions.intervalUnit,
      firstBillingDate: subscriptions.firstBillingDate,
      endDate: subscriptions.endDate,
      status: subscriptions.status,
      pausedAt: subscriptions.pausedAt,
      noticePeriodCount: subscriptions.noticePeriodCount,
      noticePeriodUnit: subscriptions.noticePeriodUnit,
      minTermCount: subscriptions.minTermCount,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(subscriptions.name))
    .all();

  return withTags(db, rows);
}

export function getSubscription(id: number, db: Db = getDb()): SubscriptionView | null {
  const rows = listSubscriptions({ status: 'all' }, db).filter((row) => row.id === id);
  return rows[0] ?? null;
}

export type SubscriptionInput = Omit<NewSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>;

export function createSubscription(
  input: SubscriptionInput,
  tagIds: number[] = [],
  db: Db = getDb(),
): number {
  const timestamp = nowIso();
  const inserted = db
    .insert(subscriptions)
    .values({ ...input, createdAt: timestamp, updatedAt: timestamp })
    .returning({ id: subscriptions.id })
    .all();

  const id = inserted[0]!.id;
  setSubscriptionTags(id, tagIds, db);
  return id;
}

export function updateSubscription(
  id: number,
  input: Partial<SubscriptionInput>,
  tagIds: number[] | undefined,
  db: Db = getDb(),
): void {
  db.update(subscriptions)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(subscriptions.id, id))
    .run();

  if (tagIds) setSubscriptionTags(id, tagIds, db);
}

export function deleteSubscription(id: number, db: Db = getDb()): void {
  db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

/**
 * Moves a subscription between active, paused and cancelled.
 *
 * Pausing and cancelling always record a date, because the schedule maths needs
 * a hard stop; without one it would keep projecting charges forever.
 */
export function setStatus(
  id: number,
  status: 'active' | 'paused' | 'cancelled',
  onDate: string,
  db: Db = getDb(),
): void {
  const patch: Partial<SubscriptionInput> = { status };
  if (status === 'paused') patch.pausedAt = onDate;
  if (status === 'cancelled') patch.endDate = onDate;
  if (status === 'active') {
    patch.pausedAt = null;
    patch.endDate = null;
  }
  updateSubscription(id, patch, undefined, db);
}

export function setSubscriptionTags(id: number, tagIds: number[], db: Db = getDb()): void {
  db.delete(subscriptionTags).where(eq(subscriptionTags.subscriptionId, id)).run();
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return;
  db.insert(subscriptionTags)
    .values(unique.map((tagId) => ({ subscriptionId: id, tagId })))
    .run();
}

// ---------------------------------------------------------------------------
// Categories and tags
// ---------------------------------------------------------------------------

export function listCategories(db: Db = getDb()): CategoryRow[] {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)).all();
}

export function upsertCategory(
  input: { id?: number; name: string; color: string; sortOrder?: number },
  db: Db = getDb(),
): number {
  if (input.id) {
    db.update(categories)
      .set({ name: input.name, color: input.color, sortOrder: input.sortOrder ?? 0 })
      .where(eq(categories.id, input.id))
      .run();
    return input.id;
  }
  const inserted = db
    .insert(categories)
    .values({ name: input.name, color: input.color, sortOrder: input.sortOrder ?? 0 })
    .returning({ id: categories.id })
    .all();
  return inserted[0]!.id;
}

export function deleteCategory(id: number, db: Db = getDb()): void {
  db.delete(categories).where(eq(categories.id, id)).run();
}

export function listTags(db: Db = getDb()): TagRow[] {
  return db.select().from(tags).orderBy(asc(tags.name)).all();
}

/** Returns the id of an existing tag with this name, creating it when absent. */
export function ensureTag(name: string, db: Db = getDb()): number {
  const trimmed = name.trim();
  const existing = db.select().from(tags).where(eq(tags.name, trimmed)).all();
  if (existing[0]) return existing[0].id;
  const inserted = db.insert(tags).values({ name: trimmed }).returning({ id: tags.id }).all();
  return inserted[0]!.id;
}

export function deleteTag(id: number, db: Db = getDb()): void {
  db.delete(tags).where(eq(tags.id, id)).run();
}

/** Removes tags that are no longer attached to any subscription. */
export function pruneOrphanTags(db: Db = getDb()): void {
  db.delete(tags)
    .where(sql`not exists (select 1 from ${subscriptionTags} st where st.tag_id = ${tags.id})`)
    .run();
}
