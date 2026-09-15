# Measuring performance

Requirements: Feeling Responsive 5.1, 5.2, 5.3

This application was slow for four months and nothing in the suite noticed. It
was found by a delivery manager saying it "seems generally a little slow", which
is where every significant defect in this project has been found — and exactly
what a suite is supposed to make unnecessary.

So there are two kinds of measurement here, and keeping them apart is the point.

| | Gates | Diagnostics |
|---|---|---|
| **What** | query counts, request counts, layout shift | wall-clock timings, Lighthouse |
| **Where** | CI, on every push | a command you run |
| **Answers** | "did this change break something?" | "what should we look at next?" |
| **Fails when** | the number grows | never — it reports |

**No wall-clock budget runs in CI** (Requirement 4.5). Timings vary with the
machine, the network and the time of day. A gate built on them fails on a slow
morning, and a test that fails for reasons unrelated to the change is a test
somebody disables within a month.

## The gates

Set as **ratchets** at what the code does today, so growth is a decision with a
reviewer rather than a drift.

| Budget | Value | Where |
|---|---|---|
| Queries per `GET /api/me` | ≤ 5 | `src/tests/integration/query-budgets.test.ts` |
| Queries per `GET /api/teams/[teamId]/trends` | ≤ 8 | same |
| API requests per dashboard load | ≤ 2 | `e2e/request-budget.spec.ts` |
| Identity requests per dashboard load | 0 | same |
| Cumulative Layout Shift, dashboard | < 0.03 | same |

The query counter is `src/tests/integration/support/counted-database.ts`. It
counts statements through Prisma's query event over the libSQL adapter —
production's path — against a real temporary file. It has its own tests, because
a counter wired to nothing reports zero and passes every budget ever set.

**The layout-shift budget is 0.03, not the industry-standard 0.1.** Written to
0.1 first, it survived the mutation that restores the navigation pop-in: the
dashboard scored 0.046 *with* the defect and 0.016 without. A number borrowed
from outside the project does not know what this project's normal is.

## Measuring the deployment

```bash
npx tsx scripts/measure-production.ts
```

Takes a URL if you want a preview instead. Reads nothing and writes nothing —
every endpoint it touches is static or answers without a session — so it is safe
to run against production as often as you like.

It samples three endpoints, chosen so subtracting one from another isolates a
layer:

- **A static page** — the edge, with no function at all.
- **`/api/me` signed out** — network and function. It returns 401 before
  touching the database.
- **A session-link lookup for a token that does not exist** — the same, plus
  exactly one database round trip, then a 404.

The difference between the last two is **one database round trip**. That
subtraction is how the original problem was found: `x-vercel-id` read
`lhr1::iad1::…`, meaning requests entered at London and executed in Washington
while the database sat in Dublin, and every query crossed the Atlantic twice.

To see where a function ran:

```bash
curl -sI https://team-health-check-pi.vercel.app/api/me | grep -i x-vercel-id
```

### The baseline

2026-09-15, from a UK client.

Measured with `curl`, which pays for a fresh TLS handshake on every invocation
and so reads higher than the script does. Kept because it is what the region
decision was made on:

| | No database | One query | Per round trip |
|---|---|---|---|
| `iad1` (Washington) → Dublin | 189ms | 249ms | **~60ms** |
| `dub1` (Dublin) → Dublin | 89ms | 98ms | **~9ms** |

Measured with `scripts/measure-production.ts`, which reuses the connection as a
browser does:

| | No database | One query | Per round trip |
|---|---|---|---|
| `dub1` (Dublin) → Dublin | 44ms | 52ms | **~8ms** |

Two tools, two numbers, both right. **Compare like with like**: a figure from
the script belongs beside another from the script.

A cold start is around 1.1s on the Hobby tier and appears as the `max` in a run.
Nothing here fixes that; the daily cron is the only thing keeping a function
warm, and paying to change that is a different decision.

## Lighthouse

Useful, and worth running when you want to know what to look at next rather than
whether something broke.

The homepage is easy — it needs no session:

```bash
npx lighthouse https://team-health-check-pi.vercel.app/ --only-categories=performance --view
```

The page that matters is behind a session, and that is the one worth auditing:
the homepage is static and was never the slow part. Point Lighthouse at a local
production build with a seeded session cookie.

1. Build and provision the end-to-end database:

```bash
npm run build && npx tsx e2e/provision-database.ts
```

2. Start the production build against that database, exactly as the browser
   suite does — see `playwright.config.ts` for the environment it uses.

3. Seed a team and mint a session row for it, then run Lighthouse with the
   cookie:

```bash
npx lighthouse "http://localhost:3000/teams/<team-id>/dashboard" --only-categories=performance --extra-headers "{\"Cookie\":\"session=<token>\"}" --view
```

`CHROME_PATH` can point at the Chromium that Playwright already installed, so
there is no second browser to manage.

### What it said, 2026-09-15

| | Homepage | Dashboard |
|---|---|---|
| Performance | 99 | 98 |
| First Contentful Paint | 1.0s | 0.8s |
| Largest Contentful Paint | 1.9s | 2.3s |
| Total Blocking Time | 60ms | 100ms |
| Cumulative Layout Shift | 0 | 0.035 |

Its only opportunities were ~27 KiB of unused JavaScript and ~13 KiB of legacy
JavaScript. Neither is why the application felt slow, which is worth knowing:
the cause was geography and request waterfalls, and a bundle report would never
have said so.

**Lighthouse throttles CPU and network by default, so its numbers are not ours.**
It reported a layout shift of 0.035 on the same page where the browser suite
measures 0.016 — same metric, same page, different conditions. Do not set a gate
from a Lighthouse figure or compare one to a Playwright one.

## When something feels slow again

1. Run `scripts/measure-production.ts` and compare with the baseline above.
2. Check `x-vercel-id`. A function that has moved region is the single largest
   thing that can happen to this application's latency.
3. Run the browser suite. The request and query budgets fail loudly when a page
   starts asking for more than it did.
4. Only then reach for Lighthouse, to find out what is worth looking at.
