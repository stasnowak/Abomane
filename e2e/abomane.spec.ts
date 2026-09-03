import { expect, test, type Page } from '@playwright/test';

/**
 * Tests share one server and one database, and both viewport projects run the
 * same specs, so nothing may depend on the database being empty. Every record
 * gets a unique name and assertions are scoped to its own row rather than to
 * page-wide totals. The exact totals maths is covered by the unit tests.
 */
function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The visible row belonging to one subscription.
 *
 * Matching is by text, not by link role: the Abos list wraps each mobile card
 * in a single link whose accessible name is the whole card, while the desktop
 * table links only the name. Both variants are always in the DOM with one
 * hidden by CSS, so the `:visible` filter picks whichever the viewport shows.
 * Subscription names are unique per test, so substring matching is safe.
 */
function rowFor(page: Page, name: string) {
  return page.locator('[data-testid="abo-row"]:visible').filter({ hasText: name }).first();
}

/** Every row for a subscription, visible or not, for absence assertions. */
function allRowsFor(page: Page, name: string) {
  return page.locator('[data-testid="abo-row"]').filter({ hasText: name });
}

async function createAbo(
  page: Page,
  fields: { name: string; amount: string; firstBillingDate: string; cycle?: string; tags?: string },
): Promise<void> {
  await page.goto('/abos/new');
  await page.getByLabel('Name').fill(fields.name);
  await page.getByLabel('Amount').fill(fields.amount);
  if (fields.cycle) await page.getByLabel('Billing cycle').selectOption(fields.cycle);
  await page.getByLabel('First billing date').fill(fields.firstBillingDate);
  if (fields.tags) await page.getByLabel('Tags').fill(fields.tags);
  await page.getByRole('button', { name: 'Create Abo' }).click();
  await expect(page.getByRole('heading', { name: fields.name })).toBeVisible();
}

test('a yearly Abo is charged once but costs a twelfth each month', async ({ page }) => {
  const name = uniqueName('JetBrains');

  await createAbo(page, {
    name,
    amount: '289,00',
    cycle: 'yearly',
    firstBillingDate: '2026-03-10',
    tags: 'work, dev',
  });

  // The detail page derives the cycle, the next charge and both cost figures.
  await expect(page.getByText('Yearly')).toBeVisible();
  await expect(page.getByText('10.03.2026')).toBeVisible();
  await expect(page.getByText('24,08 €')).toBeVisible();

  // Actual mode bills the whole amount in March.
  await page.goto('/?view=month&period=2026-03&mode=actual');
  await expect(rowFor(page, name)).toContainText('289,00 €');

  // April has no charge at all in actual mode.
  await page.goto('/?view=month&period=2026-04&mode=actual');
  await expect(allRowsFor(page, name)).toHaveCount(0);

  // Normalized mode spreads the same charge over every month: 289 / 12.
  await page.goto('/?view=month&period=2026-04&mode=normalized');
  await expect(rowFor(page, name)).toContainText('24,08 €');
});

test('a monthly Abo appears in every month in both modes', async ({ page }) => {
  const name = uniqueName('Netflix');
  await createAbo(page, { name, amount: '17,99', firstBillingDate: '2026-01-15' });

  for (const mode of ['actual', 'normalized']) {
    await page.goto(`/?view=month&period=2026-05&mode=${mode}`);
    await expect(rowFor(page, name)).toContainText('17,99 €');
  }
});

test('the list shows a new Abo and the search finds it', async ({ page }) => {
  const name = uniqueName('Hetzner');
  await createAbo(page, { name, amount: '45,00', firstBillingDate: '2026-02-20' });

  await page.goto('/abos');
  await expect(rowFor(page, name)).toBeVisible();

  await page.goto(`/abos?q=${encodeURIComponent(name)}`);
  await expect(rowFor(page, name)).toBeVisible();

  await page.goto('/abos?q=definitely-not-a-real-subscription');
  await expect(page.getByText('Nothing here yet')).toBeVisible();
});

test('an invalid amount is rejected without losing what was typed', async ({ page }) => {
  const name = uniqueName('Broken');

  await page.goto('/abos/new');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Amount').fill('free');
  await page.getByLabel('First billing date').fill('2026-03-10');
  await page.getByRole('button', { name: 'Create Abo' }).click();

  await expect(page.getByText('Enter an amount like 12,99')).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue(name);
  await expect(page.getByLabel('Amount')).toHaveValue('free');
});

test('pausing stops an Abo and resuming brings it back', async ({ page }) => {
  const name = uniqueName('Gym');
  await createAbo(page, { name, amount: '29,99', firstBillingDate: '2026-01-05' });

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('a charge due within the month shows up under Upcoming', async ({ page }) => {
  const name = uniqueName('Due Soon');
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  await createAbo(page, { name, amount: '9,99', firstBillingDate: soon });

  await page.goto('/upcoming');
  await expect(rowFor(page, name)).toContainText('9,99 €');
});

test('a cancellation deadline is worked out from the notice period', async ({ page }) => {
  const name = uniqueName('Insurance');

  await page.goto('/abos/new');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Amount').fill('84,00');
  await page.getByLabel('Billing cycle').selectOption('yearly');
  await page.getByLabel('First billing date').fill('2026-06-01');
  await page.getByLabel('Notice period').fill('3');
  await page.getByRole('button', { name: 'Create Abo' }).click();

  // Renews 1 June, three months' notice, so the deadline is 1 March.
  await expect(page.getByText(/Cancel by 01\.03\.20\d\d/)).toBeVisible();
});

test('a category can be created and then chosen on an Abo', async ({ page }) => {
  const name = uniqueName('Streaming');

  await page.goto('/settings');
  await page.getByLabel('Add a category').fill(name);
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.goto('/abos/new');
  await expect(page.getByLabel('Category')).toContainText(name);
});

test('deleting an Abo removes it from the list', async ({ page }) => {
  const name = uniqueName('Temporary');
  await createAbo(page, { name, amount: '5,00', firstBillingDate: '2026-04-01' });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(/\/abos$/);
  await expect(allRowsFor(page, name)).toHaveCount(0);
});
