import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import {
  createSubscription,
  deleteCategory,
  deleteSubscription,
  ensureTag,
  getSubscription,
  listCategories,
  listSubscriptions,
  listTags,
  pruneOrphanTags,
  setStatus,
  setSubscriptionTags,
  updateSubscription,
  upsertCategory,
  type SubscriptionInput,
} from './repo.js';

let dir: string;
let db: Db;

function input(overrides: Partial<SubscriptionInput> = {}): SubscriptionInput {
  return {
    name: 'Netflix',
    vendor: null,
    url: null,
    notes: null,
    amountCents: 1799,
    categoryId: null,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: '2026-01-15',
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'abomane-test-'));
  db = createDb(join(dir, 'test.db'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('subscriptions', () => {
  it('round-trips create, read, update and delete', () => {
    const id = createSubscription(input(), [], db);

    const created = getSubscription(id, db);
    expect(created).toMatchObject({ name: 'Netflix', amountCents: 1799, status: 'active' });
    expect(created?.createdAt).toBeTruthy();

    updateSubscription(id, { name: 'Netflix Standard', amountCents: 1399 }, undefined, db);
    expect(getSubscription(id, db)).toMatchObject({ name: 'Netflix Standard', amountCents: 1399 });

    deleteSubscription(id, db);
    expect(getSubscription(id, db)).toBeNull();
  });

  it('resolves the category on read', () => {
    const categoryId = upsertCategory({ name: 'Streaming', color: 'violet' }, db);
    const id = createSubscription(input({ categoryId }), [], db);

    expect(getSubscription(id, db)).toMatchObject({
      categoryName: 'Streaming',
      categoryColor: 'violet',
    });
  });

  it('filters by status, category, tag and search text', () => {
    const streaming = upsertCategory({ name: 'Streaming', color: 'violet' }, db);
    const work = ensureTag('work', db);

    createSubscription(input({ name: 'Netflix', categoryId: streaming }), [], db);
    createSubscription(input({ name: 'Hetzner', vendor: 'Hetzner Online' }), [work], db);
    createSubscription(input({ name: 'Old Gym', status: 'cancelled', endDate: '2026-02-01' }), [], db);

    expect(listSubscriptions({ status: 'active' }, db)).toHaveLength(2);
    expect(listSubscriptions({ status: 'all' }, db)).toHaveLength(3);
    expect(listSubscriptions({ categoryId: streaming }, db)).toHaveLength(1);
    expect(listSubscriptions({ categoryId: null, status: 'active' }, db)).toHaveLength(1);
    expect(listSubscriptions({ tagId: work }, db)).toHaveLength(1);
    expect(listSubscriptions({ search: 'hetzner online' }, db)[0]?.name).toBe('Hetzner');
    expect(listSubscriptions({ search: 'nothing here' }, db)).toHaveLength(0);
  });

  it('records a stop date when pausing or cancelling, and clears it on resume', () => {
    const id = createSubscription(input(), [], db);

    setStatus(id, 'paused', '2026-03-01', db);
    expect(getSubscription(id, db)).toMatchObject({ status: 'paused', pausedAt: '2026-03-01' });

    setStatus(id, 'cancelled', '2026-04-01', db);
    expect(getSubscription(id, db)).toMatchObject({ status: 'cancelled', endDate: '2026-04-01' });

    setStatus(id, 'active', '2026-05-01', db);
    expect(getSubscription(id, db)).toMatchObject({
      status: 'active',
      pausedAt: null,
      endDate: null,
    });
  });
});

describe('tags', () => {
  it('reuses an existing tag rather than duplicating it', () => {
    expect(ensureTag('work', db)).toBe(ensureTag(' work ', db));
    expect(listTags(db)).toHaveLength(1);
  });

  it('replaces the tag set on a subscription', () => {
    const a = ensureTag('work', db);
    const b = ensureTag('family', db);
    const id = createSubscription(input(), [a, b], db);
    expect(getSubscription(id, db)?.tags.map((tag) => tag.name)).toEqual(['family', 'work']);

    setSubscriptionTags(id, [b], db);
    expect(getSubscription(id, db)?.tags.map((tag) => tag.name)).toEqual(['family']);
  });

  it('drops tag links when the subscription is deleted, and prunes orphans', () => {
    const work = ensureTag('work', db);
    const id = createSubscription(input(), [work], db);

    deleteSubscription(id, db);
    pruneOrphanTags(db);
    expect(listTags(db)).toHaveLength(0);
  });
});

describe('categories', () => {
  it('creates, renames and lists in sort order', () => {
    const b = upsertCategory({ name: 'Software', color: 'blue', sortOrder: 2 }, db);
    upsertCategory({ name: 'Streaming', color: 'violet', sortOrder: 1 }, db);

    expect(listCategories(db).map((row) => row.name)).toEqual(['Streaming', 'Software']);

    upsertCategory({ id: b, name: 'Dev Tools', color: 'teal', sortOrder: 2 }, db);
    expect(listCategories(db).map((row) => row.name)).toEqual(['Streaming', 'Dev Tools']);
  });

  it('detaches subscriptions instead of deleting them with the category', () => {
    const categoryId = upsertCategory({ name: 'Streaming', color: 'violet' }, db);
    const id = createSubscription(input({ categoryId }), [], db);

    deleteCategory(categoryId, db);

    const after = getSubscription(id, db);
    expect(after).not.toBeNull();
    expect(after?.categoryId).toBeNull();
  });
});
