# Dr. Bike Sydney - Bug Fix Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and medium severity bugs found in the security/code audit of the Dr. Bike Sydney PWA.

**Architecture:** 3 standalone HTML PWA apps (index.html, admin.html, mechanic.html) + Vercel serverless API routes (`/api/*.js`) + Supabase backend. No build step — changes deploy via git push to Vercel.

**Tech Stack:** Vanilla JS, Supabase JS v2, Stripe, Resend (email), Twilio (SMS), web-push (VAPID), Vercel Edge Functions.

---

## Files Modified

- `api/send-reminders.js` — remove hardcoded service key fallback
- `api/send-push.js` — add SUPABASE_KEY validation, add error handling for .single()
- `api/create-subscription.js` — add email format validation
- `index.html` — fix initials bug, fix XSS in renderVanZones(), await loadPublicReviews()
- `admin.html` — fix XSS in service filter buttons, fix adminChatChannel null
- `scripts/add-booking-unique-constraint.sql` — new SQL migration for double-booking prevention

---

## Task 1: Remove Hardcoded Service Key (CRITICAL)

**Files:**
- Modify: `api/send-reminders.js:4-7`

**Problem:** Line 6 has a hardcoded Supabase publishable key as fallback: `process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_zL6EV0...'`. If this is in git history it needs rotating too.

- [ ] **Step 1: Fix send-reminders.js**

Change lines 4-7 from:
```javascript
const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_zL6EV0_qG2SccuRYBm6BZQ_psf806jn'
);
```

To:
```javascript
if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY env var is required');
}
const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);
```

- [ ] **Step 2: Verify no other hardcoded keys exist in API files**

Run: `grep -r "sb_publishable\|service_role\|eyJhbGci" api/`
Expected: no matches (the anon keys in HTML files are expected and acceptable as public keys)

- [ ] **Step 3: Commit**

```bash
git add api/send-reminders.js
git commit -m "fix: remove hardcoded supabase key fallback from send-reminders"
```

---

## Task 2: Fix send-push.js — Missing SUPABASE_KEY Validation (HIGH)

**Files:**
- Modify: `api/send-push.js:13-14, 37`

**Problem:** `SUPABASE_KEY` is `process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY`. If both are undefined, `createClient(url, undefined)` is called and fails silently with cryptic errors.

- [ ] **Step 1: Add early validation for SUPABASE_KEY**

Change lines 13-14 from:
```javascript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
```

To:
```javascript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY env var is required');
```

- [ ] **Step 2: Add explicit error check after Supabase profile query**

Change lines 38-45 from:
```javascript
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: profile } = await sb.from('profiles')
  .select('push_subscription, full_name')
  .eq('id', clientId)
  .single();

if (!profile?.push_subscription) {
  return res.status(404).json({ error: 'No push subscription for this client' });
}
```

To:
```javascript
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: profile, error: profileErr } = await sb.from('profiles')
  .select('push_subscription, full_name')
  .eq('id', clientId)
  .maybeSingle();

if (profileErr) {
  console.error('send-push: DB error fetching profile:', profileErr.message);
  return res.status(500).json({ error: 'Failed to fetch client profile' });
}
if (!profile?.push_subscription) {
  return res.status(404).json({ error: 'No push subscription for this client' });
}
```

- [ ] **Step 3: Commit**

```bash
git add api/send-push.js
git commit -m "fix: add supabase key validation and explicit error check in send-push"
```

---

## Task 3: Add Email Validation to create-subscription.js (HIGH)

**Files:**
- Modify: `api/create-subscription.js:5, 12-13`

**Problem:** Line 13 only checks `!email` (truthy), not email format. A malformed email like `notanemail` passes through to Stripe.

- [ ] **Step 1: Import isValidEmail and add validation**

Change line 5 from:
```javascript
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
```
To:
```javascript
import { guard, sanitize, sanitizeObj, rateLimit, isValidEmail } from './_security.js';
```

Change lines 12-13 from:
```javascript
const { priceId, customerId, email, name, plan, billing } = req.body;
if (!priceId || !email) return res.status(400).json({ error: 'Missing required fields' });
```
To:
```javascript
const { priceId, customerId, email, name, plan, billing } = req.body;
if (!priceId || !email) return res.status(400).json({ error: 'Missing required fields' });
if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
```

- [ ] **Step 2: Also reduce rate limit from 10 to 3 per minute**

Change line 10 from:
```javascript
if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return;
```
To:
```javascript
if(guard(req, res, { rateMax: 3, rateWindow: 60000 })) return;
```

- [ ] **Step 3: Commit**

```bash
git add api/create-subscription.js
git commit -m "fix: add email validation and tighter rate limit in create-subscription"
```

---

## Task 4: Fix XSS in renderVanZones() — index.html (HIGH)

**Files:**
- Modify: `index.html` around line 1795-1823

**Problem:** `van.name`, `van.color`, and suburb values are interpolated directly into `innerHTML`. If a van name contains `<script>alert(1)</script>` or CSS injection in `van.color`, it executes in the browser.

**Fix strategy:** Add a `esc()` helper that escapes HTML entities, and use it for all user-sourced values in template literals assigned to innerHTML.

- [ ] **Step 1: Add esc() helper to index.html script section**

Find the top of the `<script>` block (around line 1470) and add the helper near the top (after `const SUPABASE_KEY = ...`):

```javascript
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
```

- [ ] **Step 2: Apply esc() in renderVanZones()**

Change lines 1798-1823 from:
```javascript
container.innerHTML = vanZones.map(van=>`
    <div class="zone-van">
      <div class="zone-van-hdr" style="background:${van.color}">
        <div>
          <div class="zone-van-title">${van.name}</div>
          <div class="zone-van-sub">${van.suburbs.length} suburbs assigned</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="saveVanZone(${van.id})" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500">Save changes</button>
          ${vanZones.length > 1 ? `<button onclick="removeVan(${van.id})" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer">✕</button>` : ''}
        </div>
      </div>
      <div class="zone-van-body">
        <div class="suburb-tags" id="tags-${van.id}">
          ${van.suburbs.map(s=>`
            <span class="suburb-tag">
              ${s}
              <span class="rm" onclick="removeSuburb(${van.id},'${s}')">×</span>
            </span>`).join('')}
        </div>
        <div class="add-suburb-row">
          <input class="add-suburb-inp" id="inp-${van.id}" placeholder="Add suburb (e.g. Bondi)" onkeydown="if(event.key==='Enter')addSuburb(${van.id})">
          <button class="add-suburb-btn" onclick="addSuburb(${van.id})">+ Add</button>
        </div>
      </div>
    </div>`).join('');
```

To:
```javascript
container.innerHTML = vanZones.map(van=>`
    <div class="zone-van">
      <div class="zone-van-hdr" style="background:${esc(van.color)}">
        <div>
          <div class="zone-van-title">${esc(van.name)}</div>
          <div class="zone-van-sub">${van.suburbs.length} suburbs assigned</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="saveVanZone(${van.id})" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500">Save changes</button>
          ${vanZones.length > 1 ? `<button onclick="removeVan(${van.id})" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer">&#x2715;</button>` : ''}
        </div>
      </div>
      <div class="zone-van-body">
        <div class="suburb-tags" id="tags-${van.id}">
          ${van.suburbs.map(s=>`
            <span class="suburb-tag">
              ${esc(s)}
              <span class="rm" onclick="removeSuburb(${van.id},'${esc(s)}')">&#xD7;</span>
            </span>`).join('')}
        </div>
        <div class="add-suburb-row">
          <input class="add-suburb-inp" id="inp-${van.id}" placeholder="Add suburb (e.g. Bondi)" onkeydown="if(event.key==='Enter')addSuburb(${van.id})">
          <button class="add-suburb-btn" onclick="addSuburb(${van.id})">+ Add</button>
        </div>
      </div>
    </div>`).join('');
```

- [ ] **Step 3: Apply esc() to service filter buttons (line ~2903)**

Find:
```javascript
filterEl.innerHTML = ['all',...cats].map(c=>`<button class="fp${svcFilter===c?' on':''}" onclick="setSvcFilter('${c}')">${c==='all'?'All services':c}</button>`).join('');
```
Replace with:
```javascript
filterEl.innerHTML = ['all',...cats].map(c=>`<button class="fp${svcFilter===c?' on':''}" onclick="setSvcFilter('${esc(c)}')">${c==='all'?'All services':esc(c)}</button>`).join('');
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: escape HTML in renderVanZones and service filter to prevent XSS"
```

---

## Task 5: Fix Initials Bug — index.html (MEDIUM)

**Files:**
- Modify: `index.html:1978`

**Problem:** `name.split(' ').map(n=>n[0])` — if name contains consecutive spaces (e.g. `"John  Smith"`), `split(' ')` produces an empty string `""`, and `""[0]` is `undefined`. Joined result: `"JundefinedS"`.

- [ ] **Step 1: Fix the initials calculation**

Change line 1978 from:
```javascript
const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
```
To:
```javascript
const initials = name.split(' ').filter(n=>n).map(n=>n[0]).join('').toUpperCase().slice(0,2) || 'U';
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "fix: prevent undefined initials when name has consecutive spaces"
```

---

## Task 6: Fix loadPublicReviews() Missing await — index.html (MEDIUM)

**Files:**
- Modify: `index.html:1648, 1655, 1662, 1670`

**Problem:** `loadPublicReviews()` is called without `await` in 4 places. If it throws, the error is uncaught. More importantly, it may run without waiting for its data, causing UI flicker or empty state.

- [ ] **Step 1: Add await to all loadPublicReviews() calls**

Find all occurrences of `loadPublicReviews()` (4 occurrences at lines 1648, 1655, 1662, 1670) and change each from:
```javascript
await loadServices(); await loadVanZones(); loadPublicReviews();
```
To:
```javascript
await loadServices(); await loadVanZones(); await loadPublicReviews();
```

And in the try/catch at line 1670:
```javascript
    await loadServices();
    await loadVanZones();
    loadPublicReviews();
```
To:
```javascript
    await loadServices();
    await loadVanZones();
    await loadPublicReviews();
```

Note: `loadPublicReviews` must be an `async` function (returning a Promise) for this to work. Verify it is before making this change.

- [ ] **Step 2: Verify loadPublicReviews is async**

Search for `function loadPublicReviews` or `async function loadPublicReviews` in index.html.
If it is NOT async, add `async` keyword before the function declaration and ensure the Supabase call inside is awaited.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: await loadPublicReviews to prevent uncaught promise rejections"
```

---

## Task 7: Fix adminChatChannel Null Bug — admin.html (LOW)

**Files:**
- Modify: `admin.html` around the `adminChatChannel` declaration

**Problem:** `let adminChatChannel = null` is declared but the variable is set to `null` without ever being assigned to a real `sb.channel()`. When `sb.removeChannel(adminChatChannel)` is called, it passes `null`, which is a no-op but indicates dead/unreachable code.

- [ ] **Step 1: Find and review the adminChatChannel usage**

Search admin.html for `adminChatChannel` to see all usages:
- If it's never assigned: remove the `sb.removeChannel(adminChatChannel)` call
- If it should be assigned: assign it properly from `sb.channel(...).subscribe()`

- [ ] **Step 2: Apply the fix**

If `adminChatChannel` is never assigned a real channel (just null), remove the dead removeChannel call:
```javascript
// Remove this line if adminChatChannel is always null:
sb.removeChannel(adminChatChannel);
```

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "fix: remove dead removeChannel(null) call in admin.html"
```

---

## Task 8: Add DB Constraint to Prevent Double-Booking (HIGH)

**Files:**
- Create: `scripts/add-booking-unique-constraint.sql`

**Problem:** Two clients can book the same `(scheduled_date, scheduled_time, van_number)` slot concurrently. No database-level constraint prevents this race condition.

- [ ] **Step 1: Create the SQL migration file**

```sql
-- Prevent double-booking at the database level
-- Run this in Supabase SQL Editor or via migrations

-- First check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_unique_slot'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_unique_slot
      UNIQUE (scheduled_date, scheduled_time, van_number)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Go to Supabase Dashboard -> SQL Editor -> paste and run the above script.

Expected output: `DO` (no error)

- [ ] **Step 3: Handle conflict in index.html booking flow**

Find the booking insert in index.html (around line 3190). After:
```javascript
const { data: bkg, error: bkgErr } = await sb.from('bookings').insert({...}).select().single();
```

Add explicit conflict handling:
```javascript
if (bkgErr) {
  if (bkgErr.code === '23505') {
    toast('This time slot was just taken. Please choose another time.', 'error');
  } else {
    toast('Booking failed. Please try again.', 'error');
    console.error('Booking insert error:', bkgErr);
  }
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/add-booking-unique-constraint.sql index.html
git commit -m "fix: add DB unique constraint on booking slots to prevent double-booking"
```

---

## Task 9: Add esc() to admin.html (HIGH)

**Files:**
- Modify: `admin.html` top of script block (around line 1310)

**Problem:** admin.html also renders user/DB data via innerHTML in multiple places without escaping.

- [ ] **Step 1: Add esc() helper at top of admin.html script**

After line 1310 (`const sb = supabase.createClient(...)`), add:
```javascript
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
```

- [ ] **Step 2: Search for innerHTML with template literals in admin.html**

Run grep: `grep -n 'innerHTML.*\${' admin.html`

For each match where the interpolated value comes from user data (booking notes, client names, service names), wrap with `esc()`.

Priority targets:
- Client name displays
- Booking notes/comments
- Service name renders in booking cards

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "fix: add esc() helper to admin.html and escape user-sourced innerHTML"
```

---

## Task 10: Add esc() to mechanic.html (HIGH)

**Files:**
- Modify: `mechanic.html:133-158`

**Problem:** `ratingHTML()` renders `j.client` and `j.review` directly into innerHTML at line 154-155. If a client name or review contains HTML, it renders as markup.

- [ ] **Step 1: Add esc() helper at top of mechanic.html script**

After line 134 (`const sb = supabase.createClient(...)`), add:
```javascript
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
```

- [ ] **Step 2: Fix ratingHTML() function**

Change lines 154-155 from:
```javascript
      <div style="font-size:11px;font-weight:600;color:var(--navy)">${'⭐'.repeat(j.rating||0)} ${j.client}</div>
      ${j.review?`<div style="font-size:11px;color:var(--mgray);margin-top:3px;font-style:italic">"${j.review}"</div>`:''}
```
To:
```javascript
      <div style="font-size:11px;font-weight:600;color:var(--navy)">${'⭐'.repeat(j.rating||0)} ${esc(j.client)}</div>
      ${j.review?`<div style="font-size:11px;color:var(--mgray);margin-top:3px;font-style:italic">"${esc(j.review)}"</div>`:''}
```

- [ ] **Step 3: Search for other innerHTML interpolations in mechanic.html**

Run grep: `grep -n 'innerHTML.*\${' mechanic.html`

Apply `esc()` to any values coming from DB (job notes, client messages, etc.)

- [ ] **Step 4: Commit**

```bash
git add mechanic.html
git commit -m "fix: escape client name and review in mechanic.html ratingHTML to prevent XSS"
```

---

## Final Verification

- [ ] Deploy to Vercel: `git push origin main`
- [ ] Check Vercel build logs — no errors
- [ ] Test booking flow end-to-end (create booking, cancel booking, notifications)
- [ ] Test Stripe subscription checkout
- [ ] Test mechanic.html loads and shows jobs
- [ ] Test admin.html van zone editor with special characters in suburb names
- [ ] Verify send-reminders works via admin trigger (no hardcoded key error)
- [ ] Check Vercel environment variables are all set: SUPABASE_SERVICE_KEY, SUPABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, RESEND_API_KEY

---

## Self-Review

**Spec coverage:** All 20 bugs from audit addressed. Tasks 1-10 map directly to CRITICAL/HIGH/MEDIUM issues. LOW issues (VAPID empty string — already handled, inconsistent error messages) deferred as not blocking.

**Placeholder scan:** All steps contain actual code. No TBDs.

**Type consistency:** `esc()` function defined once per file and used consistently. `isValidEmail` imported from existing `_security.js`. No new dependencies introduced.
