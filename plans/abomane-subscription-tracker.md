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
Status: Not started

- [ ] `npm create astro@latest` (minimal template, TypeScript strict) at repo root; commit `package-lock.json`.
- [ ] Add `@astrojs/node` (standalone) with `output: 'server'` in `astro.config.mjs`; `server: { host: true, port: 4321 }`.
- [ ] Add Tailwind v4 via `@tailwindcss/vite` and a global `src/styles/global.css` with `@import "tailwindcss";`.
- [ ] Add ESLint (astro plugin, typescript-eslint), Prettier (astro + tailwind plugins), Vitest; scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `typecheck` (`astro check`).
- [ ] Base layout `src/layouts/Base.astro`: header with nav (Overview, Abos, Upcoming, Settings), dark-mode-aware colors, mobile-friendly.
- [ ] `.gitignore`, `.dockerignore`, `.env.example` (`DATABASE_PATH`, `PORT`, `HOST`).
- [ ] `README.md` skeleton (what it is, quick start placeholder).

### Verification Plan
- `npm ci && npm run typecheck && npm run lint && npm run build` exits 0.
- `npm run preview` then `curl -s localhost:4321/ | grep -q Abomane` succeeds.

### Phase Summary
_(write when phase completes)_

## Phase 2: Data layer
Status: Not started

- [ ] Add `drizzle-orm`, `better-sqlite3`, `drizzle-kit`; `drizzle.config.ts` pointing at `src/db/schema.ts`, migrations in `drizzle/`.
- [ ] Implement schema from **Data model** in `src/db/schema.ts`; generate initial migration with `drizzle-kit generate`.
- [ ] `src/db/client.ts`: opens `DATABASE_PATH` (default `./data/abomane.db`), creates parent dir, enables WAL + foreign keys, runs `migrate()` on first import.
- [ ] `src/db/repo.ts`: typed functions `listSubscriptions(filter)`, `getSubscription(id)`, `createSubscription`, `updateSubscription`, `deleteSubscription`, `setStatus`, `listCategories`, `upsertCategory`, `deleteCategory`, `listTags`, `setSubscriptionTags`.
- [ ] Zod schema `src/lib/validation.ts` for the subscription form (amount as decimal string → cents, dates ISO, interval rules, one-time has no interval).
- [ ] `scripts/seed.ts` inserting ~8 example Abos covering every cycle type, one paused, one cancelled, with categories and tags. Script `npm run seed`.

### Verification Plan
- `npm run seed && node -e "..."` (or a Vitest test using a temp DB path) shows 8 subscriptions and 4 categories.
- Vitest: `repo.test.ts` creates a temp SQLite file, runs migrations, does create/update/delete round trip; `npm test` passes.

### Phase Summary
_(write when phase completes)_

## Phase 3: Schedule and cost domain logic
Status: Not started

- [ ] `src/lib/dates.ts`: `addInterval(date, count, unit)` with end-of-month clamping, `startOfPeriod`, `endOfPeriod`, `periodLabel` (e.g. "September 2026", "Q3 2026", "2026"), `daysBetween`. Use plain ISO date strings (`YYYY-MM-DD`), no time zones.
- [ ] `src/lib/schedule.ts`: `nextBillingDate`, `occurrencesInRange`, `normalizedMonthlyCents`, `periodTotals`, `cancelByDate` per **Domain rules**.
- [ ] `src/lib/money.ts`: `formatEur(cents)` → `1.234,56 €`, `parseEur("12,99")` → 1299.
- [ ] Vitest tables for: monthly from the 31st across Feb; quarterly anchored to 15 Jan; yearly in Actual month view appears only in its month; custom every 45 days; one-time inside/outside range; paused/cancelled cut-offs; normalized totals equal actual totals over a full year for monthly Abos; `cancelByDate` with 3-month notice and 12-month min term.

### Verification Plan
- `npx vitest run src/lib` passes with ≥ 25 assertions; `npm run typecheck` clean.

### Phase Summary
_(write when phase completes)_

## Phase 4: Subscription management UI
Status: Not started

- [ ] Astro Actions in `src/actions/index.ts`: `subscription.create/update/delete/setStatus`, `category.upsert/delete`, `tag.create`, all validated with the Zod schema, returning field errors.
- [ ] `/abos` list page: table on desktop / cards on mobile; columns name, category, amount, cycle, next billing, status; filters by status, category, tag; sort by next billing or amount; search by name.
- [ ] `/abos/new` and `/abos/[id]/edit` form component `SubscriptionForm.astro`: cycle picker (Monthly / Quarterly / Yearly / Custom / One-time) that shows/hides interval fields, amount input with comma decimals, first billing date, notice period, min term, end date, category select, tag chips, notes, URL. Server-side error display, keeps entered values.
- [ ] `/abos/[id]` detail page: all fields, computed next billing, cancel-by date, next 5 charges, pause/resume/cancel/delete buttons (delete confirms via a `confirm()` script).
- [ ] `/settings` page: manage categories (name, color) and tags; deleting a category sets subscriptions' category to null.
- [ ] Empty states with a call to action when no Abos exist.

### Verification Plan
- `npm run build` clean; Vitest action tests: creating with invalid amount returns a field error, valid payload persists.
- Playwright (dev server): create a yearly Abo via the form, assert it appears in `/abos` with the correct next billing date; edit it to paused, assert status badge.

### Phase Summary
_(write when phase completes)_

## Phase 5: Overview, upcoming, and cancellation views
Status: Not started

- [ ] `/` overview page with URL state `?view=month|quarter|year&period=2026-09|2026-Q3|2026&mode=normalized|actual`. Defaults: month, current period, normalized.
- [ ] Period navigation (prev / today / next) and the Normalized/Actual toggle as links that update the URL (no JS required; progressive enhancement optional).
- [ ] Summary cards: total for the period, count of active Abos, largest Abo, delta versus previous period.
- [ ] Breakdown by category as a CSS bar chart, and a per-Abo table sorted by cost, each row linking to the detail page. In Actual mode rows show the charge date(s) in that period.
- [ ] A 12-column strip (month view) / 4 quarters (quarter view) / last 5 years (year view) showing totals per bucket in the selected mode, to spot spikes.
- [ ] `/upcoming` page: charges in the next 30 days (configurable via `?days=`), grouped by date, with days-until and running total.
- [ ] Cancellation deadlines section on `/upcoming` and a badge on the overview: Abos whose `cancelByDate` is within 30 days, sorted soonest first.

### Verification Plan
- Vitest for the query helpers that map URL params to periods (invalid values fall back to defaults).
- Playwright against the seeded DB: `/?view=month&mode=actual&period=<yearly Abo's month>` contains the yearly amount, the previous month does not; `/?mode=normalized` shows amount/12 for it; `/upcoming` lists the seeded Abo due within 30 days.

### Phase Summary
_(write when phase completes)_

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
