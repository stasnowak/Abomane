/**
 * Fills the database with a representative set of subscriptions.
 *
 * Dates are anchored relative to today so the seeded data always exercises the
 * "upcoming" and "cancellation deadline" views, whenever it happens to be run.
 */
import { createDb, DEFAULT_DATABASE_PATH } from '../src/db/client.js';
import { createSubscription, ensureTag, upsertCategory } from '../src/db/repo.js';
import { addDays, addMonths, makeIso, splitIso, todayIso } from '../src/lib/dates.js';

const db = createDb(process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH);

const today = todayIso();
const [year, month] = splitIso(today);
const thisMonth = makeIso(year, month, 1);

const streaming = upsertCategory({ name: 'Streaming', color: 'violet', sortOrder: 1 }, db);
const software = upsertCategory({ name: 'Software', color: 'blue', sortOrder: 2 }, db);
const insurance = upsertCategory({ name: 'Insurance', color: 'emerald', sortOrder: 3 }, db);
const home = upsertCategory({ name: 'Home', color: 'amber', sortOrder: 4 }, db);

const shared = ensureTag('shared', db);
const work = ensureTag('work', db);
const family = ensureTag('family', db);

createSubscription(
  {
    name: 'Netflix',
    vendor: 'Netflix International B.V.',
    url: 'https://netflix.com/account',
    amountCents: 1799,
    categoryId: streaming,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: addMonths(makeIso(year, month, 12), -18),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
  },
  [shared, family],
  db,
);

createSubscription(
  {
    name: 'Spotify Family',
    vendor: 'Spotify AB',
    amountCents: 1799,
    categoryId: streaming,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: addMonths(makeIso(year, month, 3), -24),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
  },
  [family],
  db,
);

// Yearly: the case the normalized/actual toggle exists for.
createSubscription(
  {
    name: 'JetBrains All Products Pack',
    vendor: 'JetBrains s.r.o.',
    amountCents: 28900,
    categoryId: software,
    cycle: 'recurring',
    intervalCount: 12,
    intervalUnit: 'month',
    firstBillingDate: addMonths(addDays(today, 21), -24),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: 1,
    noticePeriodUnit: 'month',
    minTermCount: null,
  },
  [work],
  db,
);

// Yearly with a real notice period and minimum term: drives the cancel-by view.
createSubscription(
  {
    name: 'Haftpflicht Insurance',
    vendor: 'Allianz',
    amountCents: 8400,
    categoryId: insurance,
    cycle: 'recurring',
    intervalCount: 12,
    intervalUnit: 'month',
    firstBillingDate: addMonths(addDays(today, 95), -36),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: 3,
    noticePeriodUnit: 'month',
    minTermCount: 12,
  },
  [],
  db,
);

// Quarterly.
createSubscription(
  {
    name: 'Hetzner Cloud',
    vendor: 'Hetzner Online GmbH',
    amountCents: 4500,
    categoryId: software,
    cycle: 'recurring',
    intervalCount: 3,
    intervalUnit: 'month',
    firstBillingDate: addMonths(makeIso(year, month, 20), -9),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
  },
  [work],
  db,
);

// Custom interval, and one that renews inside the next 30 days.
createSubscription(
  {
    name: 'Window Cleaning',
    vendor: 'Glanz & Co',
    amountCents: 6000,
    categoryId: home,
    cycle: 'recurring',
    intervalCount: 45,
    intervalUnit: 'day',
    firstBillingDate: addDays(today, -38),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
  },
  [home ? shared : shared],
  db,
);

// One-time payment.
createSubscription(
  {
    name: 'Alfred Powerpack (lifetime)',
    vendor: 'Running with Crayons',
    amountCents: 3400,
    categoryId: software,
    cycle: 'one_time',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: addDays(thisMonth, 8),
    endDate: null,
    status: 'active',
    pausedAt: null,
    noticePeriodCount: null,
    noticePeriodUnit: null,
    minTermCount: null,
  },
  [work],
  db,
);

// Paused.
createSubscription(
  {
    name: 'Gym Membership',
    vendor: 'FitX',
    amountCents: 2999,
    categoryId: home,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: addMonths(makeIso(year, month, 1), -14),
    endDate: null,
    status: 'paused',
    pausedAt: addMonths(today, -2),
    noticePeriodCount: 1,
    noticePeriodUnit: 'month',
    minTermCount: 12,
  },
  [],
  db,
);

// Cancelled.
createSubscription(
  {
    name: 'Adobe Creative Cloud',
    vendor: 'Adobe Inc.',
    amountCents: 6799,
    categoryId: software,
    cycle: 'recurring',
    intervalCount: 1,
    intervalUnit: 'month',
    firstBillingDate: addMonths(makeIso(year, month, 5), -20),
    endDate: addMonths(today, -3),
    status: 'cancelled',
    pausedAt: null,
    noticePeriodCount: 1,
    noticePeriodUnit: 'month',
    minTermCount: 12,
  },
  [work],
  db,
);

console.log('[abomane] seeded 9 subscriptions, 4 categories, 3 tags');
