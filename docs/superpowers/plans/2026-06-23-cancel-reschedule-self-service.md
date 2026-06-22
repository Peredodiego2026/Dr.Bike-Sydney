# Cancel / Reschedule Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mobile app users cancel or reschedule a pending/confirmed booking without contacting Diego, routed through server-side API to bypass Supabase RLS.

**Architecture:** Two new role handlers (`client-cancel`, `client-reschedule`) are added to the existing `api/auth.js` multi-role file. Both verify the user's Supabase JWT before writing. The `js/app.js` booking detail overlay gains a Reschedule panel (swaps overlay content in-place) and the cancel button is rewired to use the API instead of the direct Supabase client. No new /api/ files (Vercel 12-function limit).

**Tech Stack:** Vanilla JS, Supabase REST API (service key), existing `/api/auth` pattern.

---

## Files

- Modify: `api/auth.js` - add `handleClientCancel`, `handleClientReschedule`, wire into dispatch
- Modify: `js/app.js` - add `id="detail-panel"` to overlay inner div, add Reschedule button, rewire cancel, add reschedule panel logic

---

### Task 1: Add `handleClientCancel` to api/auth.js

**Files:**
- Modify: `api/auth.js` (after `handleClientBookings`, before `handleClientHistory`)

- [ ] **Step 1: Read the file**

```bash
# Confirm current line count and location of handleClientBookings end
# We insert handleClientCancel right after handleClientBookings (ends ~line 120)
```

- [ ] **Step 2: Add handleClientCancel function**

Insert after `handleClientBookings` closing brace (around line 120), before `handleClientHistory`:

```javascript
async function handleClientCancel(req, res) {
  const { access_token, booking_id, client_id } = req.body;
  if (!access_token || !booking_id || !client_id)
    return res.status(400).json({ error: 'access_token, booking_id, client_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be cancelled' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to cancel booking' });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Wire into dispatch in the exported handler**

In the `export default async function handler` block, add before `return handleAdmin(req, res)`:

```javascript
  if (role === 'client-cancel') return handleClientCancel(req, res);
```

- [ ] **Step 4: Syntax check**

```bash
node --check api/auth.js && echo OK
```

Expected: `OK`

---

### Task 2: Add `handleClientReschedule` to api/auth.js

**Files:**
- Modify: `api/auth.js` (right after `handleClientCancel`)

- [ ] **Step 1: Add handleClientReschedule function**

Insert immediately after `handleClientCancel` closing brace:

```javascript
async function handleClientReschedule(req, res) {
  const { access_token, booking_id, client_id, scheduled_date, scheduled_time } = req.body;
  if (!access_token || !booking_id || !client_id || !scheduled_date || !scheduled_time)
    return res.status(400).json({ error: 'access_token, booking_id, client_id, scheduled_date, scheduled_time required' });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date))
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  if (!/^\d{2}:\d{2}$/.test(scheduled_time))
    return res.status(400).json({ error: 'Invalid time format (HH:MM)' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be rescheduled' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ scheduled_date, scheduled_time }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to reschedule booking' });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Wire into dispatch**

Add in the `export default async function handler` block, right after the `client-cancel` line:

```javascript
  if (role === 'client-reschedule') return handleClientReschedule(req, res);
```

- [ ] **Step 3: Syntax check**

```bash
node --check api/auth.js && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add api/auth.js
git commit -m "feat: add client-cancel and client-reschedule API handlers"
```

---

### Task 3: Rewire cancel + add Reschedule in app.js

**Files:**
- Modify: `js/app.js` lines ~1348-1392 (the booking detail overlay inside `renderMyBookings`)

**Context:** The overlay currently uses a flat `div` with no id on the inner container. We need to:
1. Add `id="detail-panel"` to the inner container div
2. Add a Reschedule button in the overlay HTML
3. Replace the cancel click handler (currently uses direct Supabase, blocked by RLS)
4. Add the reschedule click handler (swaps panel content in-place)

- [ ] **Step 1: Add id="detail-panel" to overlay inner div and add Reschedule button**

Locate (around line 1350):
```javascript
        overlay.innerHTML = `
          <div style="background:var(--color-bg);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto">
```

Replace with:
```javascript
        overlay.innerHTML = `
          <div id="detail-panel" style="background:var(--color-bg);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto">
```

- [ ] **Step 2: Add Reschedule button to overlay HTML**

Locate (around line 1362):
```javascript
            ${canCancel ? '<button id="cancel-booking-btn" class="btn btn--secondary btn--full" style="margin-bottom:10px;color:var(--color-error);border-color:var(--color-error)">Cancel booking</button>' : ''}
```

Replace with:
```javascript
            ${canCancel ? '<button id="reschedule-btn" class="btn btn--secondary btn--full" style="margin-bottom:10px">📅 Reschedule</button>' : ''}
            ${canCancel ? '<button id="cancel-booking-btn" class="btn btn--secondary btn--full" style="margin-bottom:10px;color:var(--color-error);border-color:var(--color-error)">Cancel booking</button>' : ''}
```

- [ ] **Step 3: Replace cancel click handler**

Locate (around line 1382-1392):
```javascript
        if (canCancel) {
          overlay.querySelector('#cancel-booking-btn').addEventListener('click', async () => {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const { error } = await sb.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id).eq('client_id', user.id);
            if (error) { showToast('Could not cancel booking. Try again.', 'error'); return; }
            booking.status = 'cancelled';
            overlay.remove();
            renderList(tab);
          });
        }
```

Replace with:
```javascript
        if (canCancel) {
          overlay.querySelector('#cancel-booking-btn').addEventListener('click', async () => {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const session = (await sb.auth.getSession()).data.session;
            if (!session) return;
            const btn = overlay.querySelector('#cancel-booking-btn');
            btn.textContent = 'Cancelling...';
            btn.disabled = true;
            const resp = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'client-cancel', access_token: session.access_token, booking_id: booking.id, client_id: user.id }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              showToast(err.error || 'Could not cancel booking.', 'error');
              btn.textContent = 'Cancel booking';
              btn.disabled = false;
              return;
            }
            booking.status = 'cancelled';
            overlay.remove();
            renderList(tab);
            showToast('Booking cancelled.');
          });

          overlay.querySelector('#reschedule-btn').addEventListener('click', () => {
            const panel = document.getElementById('detail-panel');
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            panel.innerHTML = `
              <div style="font-size:17px;font-weight:700;margin-bottom:20px">📅 Reschedule</div>
              <div style="margin-bottom:16px">
                <label style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New date</label>
                <input id="resched-date" type="date" min="${tomorrow}" value="${booking.scheduled_date || ''}"
                  style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;background:var(--color-bg);color:var(--color-text)">
              </div>
              <div style="margin-bottom:24px">
                <label style="font-size:13px;color:var(--color-text-secondary);display:block;margin-bottom:6px">New time</label>
                <select id="resched-time" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;background:var(--color-bg);color:var(--color-text)">
                  ${['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00'].map(t =>
                    `<option value="${t}" ${booking.scheduled_time === t ? 'selected' : ''}>${t.replace(':00','') + (parseInt(t) < 12 ? 'am' : 'pm')}</option>`
                  ).join('')}
                </select>
              </div>
              <button id="confirm-resched-btn" class="btn btn--primary btn--full" style="margin-bottom:10px">Confirm reschedule</button>
              <button id="back-detail-btn" class="btn btn--secondary btn--full">Back</button>
            `;
            panel.querySelector('#back-detail-btn').addEventListener('click', () => overlay.remove());
            panel.querySelector('#confirm-resched-btn').addEventListener('click', async () => {
              const newDate = panel.querySelector('#resched-date').value;
              const newTime = panel.querySelector('#resched-time').value;
              if (!newDate) { showToast('Select a date.', 'error'); return; }
              const { data: { user } } = await sb.auth.getUser();
              if (!user) return;
              const session = (await sb.auth.getSession()).data.session;
              if (!session) return;
              const btn = panel.querySelector('#confirm-resched-btn');
              btn.textContent = 'Saving...';
              btn.disabled = true;
              const resp = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'client-reschedule', access_token: session.access_token, booking_id: booking.id, client_id: user.id, scheduled_date: newDate, scheduled_time: newTime }),
              });
              if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                showToast(err.error || 'Could not reschedule.', 'error');
                btn.textContent = 'Confirm reschedule';
                btn.disabled = false;
                return;
              }
              booking.scheduled_date = newDate;
              booking.scheduled_time = newTime;
              overlay.remove();
              renderList(tab);
              showToast('Booking rescheduled!');
            });
          });
        }
```

- [ ] **Step 4: Syntax check**

```bash
node --check js/app.js && echo OK
```

Expected: `OK`

- [ ] **Step 5: Commit and deploy**

```bash
git add js/app.js
git commit -m "feat: cancel/reschedule self-service via server-side API"
git push origin main
npx vercel --prod
```

---

## Self-Review

**Spec coverage:**
- Cancel booking (pending/confirmed only) - Task 1 + Task 3 Step 3 cancel handler
- Reschedule booking (pending/confirmed only) - Task 2 + Task 3 reschedule handler
- Server-side API bypass for RLS - both handlers use SERVICE_KEY
- JWT verification before any write - both handlers verify access_token
- UI: cancel button already existed, reschedule button added - Task 3 Steps 1-2
- Reschedule picker: date (tomorrow min) + time slots (8am-4pm) - Task 3 Step 3

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `booking_id` string throughout (UUID from Supabase)
- `client_id` string (UUID from Supabase auth user id)
- `access_token` JWT string
- `scheduled_date` format `YYYY-MM-DD` validated server-side
- `scheduled_time` format `HH:MM` validated server-side, stored as `"14:00"` matching existing pattern in bookings table
