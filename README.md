# Abomane

A self-hosted tracker for recurring subscriptions ("Abos"), built for mixed
billing cycles: monthly, quarterly, yearly, custom intervals and one-time
payments all live side by side, and the overview shows what they really cost
per month, quarter and year.

Runs with a single `docker compose up`.

## Status

Under construction. See [`plans/abomane-subscription-tracker.md`](plans/abomane-subscription-tracker.md)
for the implementation plan and progress.

## Development

```bash
npm install
npm run seed      # optional: example data
npm run dev       # http://localhost:4321
```

Checks:

```bash
npm run lint
npm run typecheck
npm test
```
