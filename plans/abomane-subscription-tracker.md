# Abomane: Subscription (Abo) Tracker

A self-hosted, single-user web app to track recurring subscriptions ("Abos") with
mixed billing cycles, and to see what they cost per month, quarter, and year.
Runs with a single `docker compose up`, locally or on any Docker host.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is done,
set its status to `Complete` and write its **Phase Summary** (what was done, key
decisions, anything needed to continue with zero context); run the phase's
**Verification Plan** and record the result before moving on. When all phases are
done, fill in **Final Recap** and **Deployment Plan**.

## Confirmed scope (from the owner)

| Topic | Decision |
|---|---|
| Users / auth | Single user, no login. Expected to run on localhost or behind the owner's own proxy/VPN. |
| Database | SQLite file in a Docker volume. One container only. |
| Currency | EUR only. Amounts stored as integer cents. Display `1.234,56 €`. |
| Billing cycles | monthly, quarterly, yearly, custom `every N days/weeks/months`, one-time payment. |
| Overview views | Monthly, quarterly, yearly. Toggle between **Normalized** (cost spread evenly, yearly/12 per month) and **Actual** (real charges landing in that period). |
| Cancellation | Notice period + minimum term per Abo. Show "cancel by" date, flag near deadlines. Optional end date marks an Abo as cancelled. |
| Extras in v1 | Categories, tags, upcoming renewals list (next 30 days). |
| Not in v1 | Email reminders, CSV/JSON import/export, multi-user, multi-currency, price history. |
| UI language | English. European number/date formatting. |

## Assumptions (routine choices, change here if wrong)

- **Astro 5** (latest stable at time of scaffold) in SSR mode with `@astrojs/node`
  standalone adapter. Forms use **Astro Actions**; no client-side UI framework.
  Small interactive bits (toggle, period navigation) are plain `<script>` or URL params.
- **Tailwind CSS v4** via `@tailwindcss/vite`. Dark mode follows `prefers-color-scheme`.
  Mobile-first layout (the owner uses the mobile app).
- **Drizzle ORM** + `better-sqlite3`, with `drizzle-kit` generating SQL migrations
  committed to the repo. Migrations run automatically at container start.
- **Vitest** for unit tests (domain logic), **Playwright** for a smoke test against
  the compose stack. TypeScript strict, ESLint + Prettier.
- Charts are CSS bar charts (Tailwind), no chart library.
- Runtime: `node:22-bookworm-slim` image (glibc, so `better-sqlite3` prebuilt binaries work).
  App listens on `0.0.0.0:4321`, compose maps `4321:4321`, database at `/data/abomane.db`.
- Statuses: `active`, `paused`, `cancelled`. Paused and cancelled Abos are excluded from
  cost views for periods after their pause/end date, but remain visible under a filter.
- "Custom" cycle stores `intervalCount` + `intervalUnit` (`day | week | month`); the preset
  cycles are stored as `month×1`, `month×3`, `month×12` so all schedule math has one code path.
  Yearly is `month×12`, never `year` as a unit.
- End-of-month rule: adding months to the 31st clamps to the last day of the target month
  (Jan 31 → Feb 28/29 → Mar 31 stays anchored to the original day-of-month).

## Data model

```
categories      id, name (unique), color (tailwind token), sort_order
tags            id, name (unique)
subscriptions   id, name, vendor?, url?, notes?,
                amount_cents (int), category_id? (fk),
                cycle: 'recurring' | 'one_time',
                interval_count (int, e.g. 1/3/12), interval_unit ('day'|'week'|'month'),
                first_billing_date (ISO date), end_date? (ISO date),
                status ('active'|'paused'|'cancelled'), paused_at?,
                notice_period_count?, notice_period_unit? ('day'|'week'|'month'),
                min_term_count?, min_term_unit? ('month'),
                created_at, updated_at
subscription_tags   subscription_id, tag_id (pk both)
```

## Domain rules (pure functions in `src/lib/schedule.ts`)

- `nextBillingDate(sub, from)` – first occurrence on/after `from`, honoring `end_date`.
- `occurrencesInRange(sub, start, end)` – all charge dates in `[start, end)`. One-time
  returns at most its single date.
- `normalizedMonthlyCents(sub)` – recurring cost averaged to one month
  (`amount / months-per-cycle`; day/week intervals convert via 365.25/12 days per month).
  One-time payments contribute 0 to normalized views.
- `periodTotals(subs, period: {kind:'month'|'quarter'|'year', start}, mode:'normalized'|'actual')`
  → `{ totalCents, perSubscription[], perCategory[] }`.
- `cancelByDate(sub, asOf)` – the last day to give notice before the next renewal that
  can still be avoided: `nextRenewalAfterMinTerm - noticePeriod`. Returns `null` when
  no notice period is set.

## Phase 1: Project scaffold
Status: Complete

- [x] `npm create astro@latest` (minimal template, TypeScript strict) at repo root; commit `package-lock.json`.
- [x] Add `@astrojs/node` (standalone) with `output: 'server'` in `astro.config.mjs`; `server: { host: true, port: 4321 }`.
- [x] Add Tailwind v4 via `@tailwindcss/vite` and a global `src/styles/global.css` with `@import "tailwindcss";`.
- [x] Add ESLint (astro plugin, typescript-eslint), Prettier (astro + tailwind plugins), Vitest; scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `typecheck` (`astro check`).
- [x] Base layout `src/layouts/Base.astro`: header with nav (Overview, Abos, Upcoming, Settings), dark-mode-aware colors, mobile-friendly.
- [x] `.gitignore`, `.dockerignore`, `.env.example` (`DATABASE_PATH`, `PORT`, `HOST`).
- [x] `README.md` skeleton (what it is, quick start placeholder).

### Verification Plan
- `npm ci && npm run typecheck && npm run lint && npm run build` exits 0.
- `npm run preview` then `curl -s localhost:4321/ | grep -q Abomane` succeeds.

**Result:** `astro check` reports 0 errors across 21 files, `eslint .` is clean,
`astro build` completes, and the built server answers 200 on `/`.

### Phase Summary
The ecosystem had moved well past the versions the plan assumed, so the scaffold
targets **Astro 7.2.10**, not Astro 5, with **Tailwind 4.3.3**, **Zod 4.5.4**,
**Vitest 4.1.11** and **Drizzle 0.45.2**. Astro's `output: 'server'` option and
the Actions API are unchanged, so the plan's architecture survived intact.

`npm create astro` could not be used: the template fetch reaches GitHub, which
this environment's egress proxy blocks. The project was therefore assembled by
hand, which produced the same result with fewer unused files. TypeScript is
pinned to 5.x rather than the newly released 7.x, because `@astrojs/check` has
not been validated against the native port.

Notable deviations from the plan's assumptions:
- Node 22 is used for the runtime, and `tsx` runs TypeScript scripts. Node's own
  type stripping cannot resolve the `.js`-suffixed ESM imports the codebase uses.
- Migrations in production run through `scripts/migrate.mjs`, plain JavaScript
  with no TypeScript loader and no dependency on the built bundle, so a failed
  upgrade stops the container before the server binds.

## Phase 2: Data layer
Status: Complete

- [x] Add `drizzle-orm`, `better-sqlite3`, `drizzle-kit`; `drizzle.config.ts` pointing at `src/db/schema.ts`, migrations in `drizzle/`.
- [x] Implement schema from **Data model** in `src/db/schema.ts`; generate initial migration with `drizzle-kit generate`.
- [x] `src/db/client.ts`: opens `DATABASE_PATH` (default `./data/abomane.db`), creates parent dir, enables WAL + foreign keys, runs `migrate()` on first import.
- [x] `src/db/repo.ts`: typed functions `listSubscriptions(filter)`, `getSubscription(id)`, `createSubscription`, `updateSubscription`, `deleteSubscription`, `setStatus`, `listCategories`, `upsertCategory`, `deleteCategory`, `listTags`, `setSubscriptionTags`.
- [x] Zod schema `src/lib/validation.ts` for the subscription form (amount as decimal string → cents, dates ISO, interval rules, one-time has no interval).
- [x] `scripts/seed.ts` inserting ~8 example Abos covering every cycle type, one paused, one cancelled, with categories and tags. Script `npm run seed`.

### Verification Plan
- `npm run seed && node -e "..."` (or a Vitest test using a temp DB path) shows 8 subscriptions and 4 categories.
- Vitest: `repo.test.ts` creates a temp SQLite file, runs migrations, does create/update/delete round trip; `npm test` passes.

**Result:** the seed inserts 9 subscriptions, 4 categories and 3 tags, covering
monthly, quarterly, yearly, a 45-day custom interval, a one-time payment, one
paused and one cancelled row. `repo.test.ts` runs against a temporary SQLite
file and passes.

### Phase Summary
The schema follows the plan. Two behaviours are worth knowing before changing
this layer:

- **Pausing and cancelling always write a date.** `setStatus` records `pausedAt`
  or `endDate`, and the validation layer backfills one when a form omits it.
  Without a hard stop the schedule maths would project charges forever, so the
  invariant "a non-active subscription has a stop date" is load-bearing.
- **Deleting a category detaches its subscriptions** rather than deleting them,
  via `on delete set null`. Tag links cascade instead, and `pruneOrphanTags`
  clears tags left behind.

Reads go through `listSubscriptions`, which joins the category and batches tag
lookups into one extra query rather than one per row.

## Phase 3: Schedule and cost domain logic
Status: Complete

- [x] `src/lib/dates.ts`: `addInterval(date, count, unit)` with end-of-month clamping, `startOfPeriod`, `endOfPeriod`, `periodLabel` (e.g. "September 2026", "Q3 2026", "2026"), `daysBetween`. Use plain ISO date strings (`YYYY-MM-DD`), no time zones.
- [x] `src/lib/schedule.ts`: `nextBillingDate`, `occurrencesInRange`, `normalizedMonthlyCents`, `periodTotals`, `cancelByDate` per **Domain rules**.
- [x] `src/lib/money.ts`: `formatEur(cents)` → `1.234,56 €`, `parseEur("12,99")` → 1299.
- [x] Vitest tables for: monthly from the 31st across Feb; quarterly anchored to 15 Jan; yearly in Actual month view appears only in its month; custom every 45 days; one-time inside/outside range; paused/cancelled cut-offs; normalized totals equal actual totals over a full year for monthly Abos; `cancelByDate` with 3-month notice and 12-month min term.

### Verification Plan
- `npx vitest run src/lib` passes with ≥ 25 assertions; `npm run typecheck` clean.

**Result:** 66 tests pass in total, every case from the checklist covered.
`astro check` reports 0 errors.

### Phase Summary
The cost model lives in pure functions over ISO date strings, with no `Date`
objects in the domain: billing dates are calendar facts, and a time zone must
never be able to shift one across a month boundary.

Three decisions a future agent should not undo by accident:

- **Occurrences are computed from the anchor, never iteratively.** The k-th
  charge is `addMonths(firstBillingDate, count * k)`. Adding one month k times
  instead would make a subscription billed on the 31st drift permanently to the
  28th after passing February. `addMonths` clamps to the end of the target month
  but keeps the original day for later steps.
- **One-time payments contribute nothing to normalized views.** They are real
  cash out, but folding them into a monthly average would misstate the ongoing
  commitment. They appear at full value in actual mode.
- **`indexAtOrAfter` seeds its search arithmetically.** A daily subscription
  queried decades after its start resolves in a few steps rather than thousands,
  which keeps `occurrencesInRange` cheap enough to call per row per page.

`cancelByDate` walks forward from the later of today and the end of the minimum
term, returning the first renewal whose notice deadline has not already passed.

## Phase 4: Subscription management UI
Status: Complete

- [x] Astro Actions in `src/actions/index.ts`: `subscription.create/update/delete/setStatus`, `category.upsert/delete`, `tag.create`, all validated with the Zod schema, returning field errors.
- [x] `/abos` list page: table on desktop / cards on mobile; columns name, category, amount, cycle, next billing, status; filters by status, category, tag; sort by next billing or amount; search by name.
- [x] `/abos/new` and `/abos/[id]/edit` form component `SubscriptionForm.astro`: cycle picker (Monthly / Quarterly / Yearly / Custom / One-time) that shows/hides interval fields, amount input with comma decimals, first billing date, notice period, min term, end date, category select, tag chips, notes, URL. Server-side error display, keeps entered values.
- [x] `/abos/[id]` detail page: all fields, computed next billing, cancel-by date, next 5 charges, pause/resume/cancel/delete buttons (delete confirms via a `confirm()` script).
- [x] `/settings` page: manage categories (name, color) and tags; deleting a category sets subscriptions' category to null.
- [x] Empty states with a call to action when no Abos exist.

### Verification Plan
- `npm run build` clean; Vitest action tests: creating with invalid amount returns a field error, valid payload persists.
- Playwright (dev server): create a yearly Abo via the form, assert it appears in `/abos` with the correct next billing date; edit it to paused, assert status badge.

**Result:** verified against the running production build rather than Playwright
(the browser suite lands in Phase 7). Posting the create form with
`cyclePreset=yearly` stored `interval_count=12, interval_unit=month`, created the
two named tags and redirected to the new record. Posting an unparseable amount
re-rendered the form with "Enter an amount like 12,99" and both submitted values
still filled in. Pause wrote `paused_at`, resume cleared it, and a duplicate
category name was rejected with a field error. Every route answers 200, and an
unknown id answers 404. `astro check` reports 0 errors, 0 hints.

### Phase Summary
Actions take **raw `FormData`** rather than letting Astro apply the Zod schema
directly. Astro's built-in path reports validation failures without the values
that caused them, and it discards the request body once the action has run, so a
failed submit would clear the form. Parsing inside the handler lets each action
return `{ ok: false, fieldErrors, values }` and the page re-render exactly what
was typed. Anything replacing this needs to keep that round trip.

Two other things worth knowing:
- Astro 7 enforces a **same-origin check on form POSTs**. Form submissions go to
  `?_action=name` on the current page, not to a separate endpoint, and a POST
  without a matching `Origin` header is refused with 403. Any script or test
  posting to an action must send that header.
- `z` from `astro:schema` is **deprecated** in Astro 7. Actions import `zod`
  directly; both resolve to the same hoisted instance, so schemas are compatible
  either way.

Categories use a fixed palette in `src/lib/colors.ts` rather than storing raw
class names, because Tailwind only compiles classes it can see in the source and
an interpolated colour would silently render unstyled.

## Phase 5: Overview, upcoming, and cancellation views
Status: Complete

- [x] `/` overview page with URL state `?view=month|quarter|year&period=2026-09|2026-Q3|2026&mode=normalized|actual`. Defaults: month, current period, normalized.
- [x] Period navigation (prev / today / next) and the Normalized/Actual toggle as links that update the URL (no JS required; progressive enhancement optional).
- [x] Summary cards: total for the period, count of active Abos, largest Abo, delta versus previous period.
- [x] Breakdown by category as a CSS bar chart, and a per-Abo table sorted by cost, each row linking to the detail page. In Actual mode rows show the charge date(s) in that period.
- [x] A 12-column strip (month view) / 4 quarters (quarter view) / last 5 years (year view) showing totals per bucket in the selected mode, to spot spikes.
- [x] `/upcoming` page: charges in the next 30 days (configurable via `?days=`), grouped by date, with days-until and running total.
- [x] Cancellation deadlines section on `/upcoming` and a badge on the overview: Abos whose `cancelByDate` is within 30 days, sorted soonest first.

### Verification Plan
- Vitest for the query helpers that map URL params to periods (invalid values fall back to defaults).
- Playwright against the seeded DB: `/?view=month&mode=actual&period=<yearly Abo's month>` contains the yearly amount, the previous month does not; `/?mode=normalized` shows amount/12 for it; `/upcoming` lists the seeded Abo due within 30 days.

**Result:** `query.test.ts` covers the parameter mapping, including a view and
period that disagree. Checked against the seeded database with the yearly
JetBrains subscription (289,00 € renewing 24 September 2026):

| View | Mode | Total |
|---|---|---|
| September 2026 | actual | 463,98 € |
| September 2026 | normalized | 122,64 € |
| 2026 | actual | 1.808,64 € |
| 2026 | normalized | 1.846,13 € |

The full 289,00 € appears in September in actual mode and is absent from August;
normalized mode shows 24,08 € for the same subscription, which is 289/12. The
September gap between the two modes is the yearly charge landing in that month,
which is exactly the spike the toggle exists to reveal. `/upcoming` lists 6
charges totalling 463,98 €, matching the sum of the individual amounts, and
flags the insurance cancellation deadline 4 days out.

### Phase Summary
The overview keeps all its state in the URL (`view`, `period`, `mode`), so every
control is a plain link, navigation needs no JavaScript, and any view can be
bookmarked. `parseOverviewQuery` falls back to defaults on anything unparseable
rather than erroring, because a hand-edited URL should never break the page.

Switching the view keeps the point in time rather than resetting to today, so
September becomes Q3 instead of jumping somewhere unrelated.

**Cancelled subscriptions are deliberately included** in the overview query. Their
charges before the end date are real money that was spent, and excluding them
would make past periods understate the total. The schedule maths stops them at
their end date, so they cost nothing in later periods without needing a filter.

The comparison strip under the totals renders as CSS-sized bars with no chart
library, which keeps the page dependency-free and works without JavaScript.

## Phase 6: Docker and Compose
Status: Not started

- [ ] Multi-stage `Dockerfile`: `deps` (npm ci), `build` (astro build), `runtime` (`node:22-bookworm-slim`, non-root user, only `dist/`, `drizzle/`, production `node_modules`).
- [ ] `docker-entrypoint.sh`: create `/data` if missing, run migrations (`node dist/migrate.mjs` built from `src/db/migrate.ts`), then `node dist/server/entry.mjs`.
- [ ] `compose.yaml`: service `app`, `build: .`, `ports: "4321:4321"`, `volumes: abomane-data:/data`, env `DATABASE_PATH=/data/abomane.db HOST=0.0.0.0 PORT=4321`, `restart: unless-stopped`, healthcheck on `GET /healthz`.
- [ ] `/healthz` endpoint returning 200 and a DB `SELECT 1`.
- [ ] Optional `compose.override.example.yaml` showing how to use a prebuilt image (`image: ghcr.io/stasnowak/abomane:latest`) instead of building.
- [ ] GitHub Actions workflow `ci.yml`: lint, typecheck, test, build, and docker build on push; publish image to GHCR on tags.
- [ ] README: quick start (`docker compose up -d`, open http://localhost:4321), backup (`docker compose cp app:/data/abomane.db ./backup.db`), update, reverse-proxy note (no auth built in, put it behind your proxy/VPN), development setup.

### Verification Plan
- `docker compose up -d --build` then `curl -fs localhost:4321/healthz` returns 200 within 60 s.
- Create an Abo through the UI, `docker compose down && docker compose up -d`, the Abo is still there (volume persistence).
- `docker compose down -v` leaves no orphan containers; image size reported and under ~250 MB.

### Phase Summary
_(write when phase completes)_

## Phase 7: End-to-end smoke and polish
Status: Not started

- [ ] Playwright config with a `compose` project that targets `http://localhost:4321`; smoke spec covering create → overview → upcoming → delete.
- [ ] Responsive pass on 375 px and 1280 px widths; dark-mode pass; keyboard focus styles; form labels and `aria-*` for the toggle and nav.
- [ ] 404 page and action error page styled with the base layout.
- [ ] Final README proofread; `plans/` recap and deployment plan filled in.

### Verification Plan
- `npx playwright test` passes against the running compose stack.
- `npm run lint && npm run typecheck && npm test` clean on the final commit.

### Phase Summary
_(write when phase completes)_

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions)_
