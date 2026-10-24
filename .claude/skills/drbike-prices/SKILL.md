---
name: drbike-prices
description: Use when Diego asks to change, raise or lower a service price, add, remove or rename a service, or change the visit & diagnosis / call-out fee - "cambiar precios", "subir precios", "agregar servicio", "quitar servicio", "la visita", "diagnosis fee", "callout". Also when services:check reports stale prices.
---

# Changing prices and services (Dr. Bike Sydney)

## The one idea

The **database is the price**. The booking wizard, Stripe charge, chatbot and
Admin read the `services` table live. Everything else is a copy, and copies
drift. So every change is: **SQL first, then `npm run prices:sync`, then read
its list, then checks, then one PR merged right away.**

## Where each number lives

| Number | Source of truth | Copies the sync rewrites | Copies a person fixes |
|---|---|---|---|
| Service price | `services.price` | cards in `index.html`/`landing.html`, landing JSON-LD offers, the 15 suburb pages (generator: cards, FAQ, priceRange) | prose: terms (3 langs), blog, emails, `business.html` fleet table, membership savings math, i18n strings |
| Visit & diagnosis fee | `api/_coverage.js` (`FEE_BANDS`, `PENINSULA_FAR_FEE`, `NORTH_NEAR_FEE`) **and** `callout_zones.callout_fee` (fallback when routing is down) - both, same ladder | chatbot text (derives from `FEE_BANDS`) | "from $X" copy everywhere, `tests/unit/coverage-resolution.test.js` |
| Membership "minor repair" ceiling | `MINOR_SERVICE_MAX_PRICE` in `api/auth.js` | - | "under $X" copy (3 surfaces x 3 langs) |

Names the code depends on - never rename or delete without changing code too:
`Tune-Up`, `Bike Wash` (membership buckets, `api/auth.js` `membershipCategoryFor`),
`Emergency Service` (`js/app.js`, price 0 = quote), and the four in
`SERVICE_KEYS` of `scripts/generate-suburb-pages.mjs`.

## Procedure (every case)

1. Read the table first (anon key, read-only - see the query in `scripts/prices-sync.mjs`) so the SQL targets real names.
2. Write the SQL, **paste it whole in a ```sql block in chat**, with its verification query. Diego runs it in Supabase. Never claim it ran - ask. (A single price can also be edited in Admin > Services & Prices - same table, same next steps.)
3. On a branch off `origin/main` in a worktree: `npm run prices:sync`. Use `--dry-run` first if unsure.
4. Work its output top to bottom:
   - **NAMES THE SERVICE OR THE VISIT** - fix every line, in en, es and zh.
   - **SAME NUMBER, NO NAME** - read each; fix the ones about a moved price (often the line above names it), leave unrelated ones.
   - **CODE COMMENTS** - update if they state the price as current.
   - **TESTS** - update fixtures that pin a moved price.
   - **BLOCKER** lines must be gone before the PR.
   - **MEMBERSHIP CEILING** - ask Diego whether a service changing bucket is intended.
5. Re-run `npm run prices:sync` until the first two lists hold only lines you decided to leave.
6. If `js/i18n*.js` changed: bump `CACHE_STATIC` in `sw.js`. If `js/app.js` or `js/landing-inline.js` changed: bump their `?v=` by hand in the HTML that loads them.
7. `npm run services:check`, `npm run check`, `npx vitest run` - judge by exit code. Preview `/`, `/#book-service` and a suburb page.
8. Commit only the files you touched (never `git add -A`), PR, tell Diego in Spanish: what the SQL changed, what the PR changes, that it is live only after merge + ~2 min deploy.

## SQL templates

Change prices (the `and price = <old>` guard makes it safe to run twice):
```sql
update public.services set price = 129 where name = 'Tune-Up' and price = 119;
-- verify
select name, price from public.services where name in ('Tune-Up') order by name;
```
Everything +N: copy `scripts/raise-prices-10.sql` (one-shot lock, skips $0 rows).

Add a service (`category` must be an existing one - list them first):
```sql
insert into public.services (category, name, price, duration_min, duration_max, description, active)
values ('Wheels & tyres', 'Wheel Build', 249, 120, 180, 'Hand-built wheel, tensioned and trued', true);
-- verify
select category, name, price from public.services where name = 'Wheel Build';
```
Then: a card in landing.html "All Services" under the matching heading (`.svc-card > .svc-name + .svc-price`, name exactly as in the table); the table's name and description in the Supabase catalog block at the end of `js/i18n-es.js` and `js/i18n-zh.js`, plus the card's own text if it differs (`npm run i18n:check` names what is missing); bump `sw.js`. `services:check` lists anything else missing.

Rename: `update ... set name = 'New' where name = 'Old';` then rename the cards, or add `'Card text': 'New'` to `NAME_MAP` in `js/live-prices.js`; add es/zh entries for the new name.

Remove - needs Diego's explicit yes (CLAUDE.md: no DELETE without confirming):
```sql
select count(*) from public.bookings where service_id = (select id from public.services where name = 'Wheel Build');
```
Bookings keep `service_name`, so history still reads. `active = false` does **not** hide a service today - nothing filters on it. After the delete: remove its cards and any `NAME_MAP` entry pointing at it.

Visit fee: move `FEE_BANDS` / `PENINSULA_FAR_FEE` / `NORTH_NEAR_FEE` and the test in the PR, and `callout_zones` by SQL to the same ladder; zones above the top band mean "outside the perimeter". `callout_zones` has no Admin screen:
```sql
update public.callout_zones set callout_fee = 40 where name = 'Northern Beaches' and callout_fee = 35;
-- verify
select name, callout_fee from public.callout_zones order by callout_fee;
``` **Order matters:** run the SQL, then merge immediately - in between, a booking made with routing down is quoted from the table against the code's bands. `prices:sync` prints a BLOCKER while the two floors disagree.

## Do not

- Re-run `scripts/translate-blog-posts.mjs` - it no longer reproduces its committed pages. Edit the dictionary entry and the es/zh blog files by hand.
- Hand-edit suburb pages - change the generator; `npm run check` fails on drift.
- Quote a price from this file or CLAUDE.md - read the table.
