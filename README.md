# Abomane

A self-hosted tracker for recurring subscriptions ("Abos").

Built for the awkward part of subscription tracking: not everything is monthly.
Yearly insurance, quarterly hosting, a 45-day cleaning contract and a one-off
lifetime licence all live side by side, and the overview still answers "what do
these cost me per month, per quarter, per year".

One `docker compose up` and it runs.

## Quick start

```bash
git clone https://github.com/stasnowak/Abomane.git
cd Abomane
docker compose up -d
```

Open <http://localhost:4321>.

The database is a single SQLite file in the `abomane-data` volume. Migrations
run automatically when the container starts, so upgrading is `docker compose
pull` (or `build`) followed by `up -d`.

> **There is no login.** The compose file binds the app to `127.0.0.1` so a
> plain `docker compose up` is safe on your own machine. Before putting it on a
> server, read [Hosting it somewhere](#hosting-it-somewhere).

## What it does

**Every billing cycle.** Monthly, quarterly and yearly as presets; a custom
"every N days / weeks / months" for odd contracts; and one-time payments for
lifetime licences. Charge dates are computed from the first billing date, so a
subscription billed on the 31st stays on the 31st instead of drifting to the
28th after it passes February.

**Two ways of counting.** Every overview can be read in either mode, and the
toggle keeps everything else in place:

| Mode       | What it counts                                                                                               | Answers                           |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Normalized | Recurring cost spread evenly across the months it is active, so a yearly Abo counts as one twelfth per month | What am I committed to per month  |
| Actual     | Only the charges that really land in the period                                                              | What leaves my account this month |

The difference is the point. A month with a big yearly renewal looks expensive
in actual mode and ordinary in normalized mode, and you want to see both.

**Monthly, quarterly and yearly views**, each with previous/next navigation and
a strip showing the neighbouring periods, so a spike is obvious next to the
months around it.

**Cancellation deadlines.** Record a notice period and a minimum term, and
Abomane works out the last day you can give notice to avoid the next renewal.
Anything falling due within 30 days is flagged on the overview and listed under
Upcoming.

**Upcoming charges** for the next 30, 60 or 90 days, grouped by date with a
running total.

**Categories and tags**, with a cost breakdown by category.

Amounts are in euros and formatted the German way (`1.234,56 €`).

## Hosting it somewhere

Abomane has no user accounts and no password. Anyone who can reach the port can
read and change everything. That is a deliberate trade-off for a personal tool,
and it means the network in front of it is doing the security.

Put one of these between Abomane and the internet:

- a reverse proxy that handles authentication (Caddy with basic auth, nginx
  with an auth subrequest, oauth2-proxy, Authelia, Tailscale Serve),
- a VPN or private network,
- or nothing, if it only ever listens on localhost.

To change how it is published:

```bash
cp compose.override.example.yaml compose.override.yaml
# edit, then
docker compose up -d
```

The example shows how to bind to all interfaces and how to run a prebuilt image
from the container registry instead of building from source.

## Backups

Everything lives in one SQLite file, so a backup is a file copy:

```bash
docker compose cp app:/data/abomane.db ./abomane-backup.db
```

Restore by stopping the stack, copying the file back, and starting it again:

```bash
docker compose down
docker compose cp ./abomane-backup.db app:/data/abomane.db
docker compose up -d
```

The database runs in WAL mode. Copying it while the app is running is fine for a
personal tool, but stop the container first if you want a guaranteed-consistent
snapshot.

## Configuration

Everything is environment variables, all optional:

| Variable         | Default in Docker  | What it does                        |
| ---------------- | ------------------ | ----------------------------------- |
| `DATABASE_PATH`  | `/data/abomane.db` | Where the SQLite file lives         |
| `HOST`           | `0.0.0.0`          | Bind address inside the container   |
| `PORT`           | `4321`             | Port inside the container           |
| `MIGRATIONS_DIR` | `/app/drizzle`     | Where migration files are read from |

## Development

Node 22 or newer.

```bash
npm install
npm run seed     # optional: example data covering every cycle type
npm run dev      # http://localhost:4321
```

Checks, all of which run in CI:

```bash
npm run lint
npm run typecheck
npm test         # unit tests: schedule maths, money parsing, database layer
npm run test:e2e # Playwright, against a production build
```

Changing the database schema:

```bash
# edit src/db/schema.ts, then
npm run db:generate   # writes a migration into drizzle/
npm run db:migrate    # applies it locally
```

Commit the generated migration. The container applies pending migrations on
start, before the server binds, so a broken upgrade fails loudly instead of
surfacing on someone's first request.

## How it is built

Astro 7 in server mode on the Node adapter, Tailwind 4, Drizzle ORM over SQLite
via better-sqlite3, Zod for form validation, Vitest and Playwright for tests.

Two decisions shape most of the code:

**The cost model is pure functions over ISO date strings.** `src/lib/schedule.ts`
has no database access and no `Date` objects. Billing dates are calendar facts,
and a time zone must never be able to shift one across a month boundary. It is
covered by unit tests rather than by clicking through the app.

**Every cycle is one interval count plus one unit.** Monthly is `1 month`,
quarterly `3 month`, yearly `12 month`, and a custom contract says what it is.
There is no separate code path per cycle, which is why adding "every 45 days"
cost nothing.

The overview keeps its whole state in the URL, so navigation and the cost-mode
toggle are plain links: they work without JavaScript and every view can be
bookmarked.

## Licence

MIT
