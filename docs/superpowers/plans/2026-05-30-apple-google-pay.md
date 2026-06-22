# Apple Pay + Google Pay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Apple Pay and Google Pay across subscriptions (Stripe Checkout) and per-service bookings (in-app Payment Request Button).

**Architecture:** Two independent changes: (1) remove `payment_method_types` restriction in create-subscription.js so Stripe Checkout auto-enables wallets, (2) add Stripe Payment Request Button to the showPaymentModal function in index.html above the existing Card Element.

**Tech Stack:** Stripe.js v3 (already loaded), Stripe Payment Request API, vanilla JS.

---

### Task 1: Enable Apple Pay + Google Pay on Subscriptions

**Files:**
- Modify: `api/create-subscription.js:51`

- [ ] **Step 1: Remove payment_method_types restriction**

In `api/create-subscription.js`, find line 51:
```javascript
      payment_method_types: ['card'],
```
Delete this entire line. When `payment_method_types` is omitted, Stripe Checkout automatically enables all payment methods configured in the Stripe Dashboard (card, Apple Pay, Google Pay, Link).

The `stripe.checkout.sessions.create` call should go from:
```javascript
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
```
To:
```javascript
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
```

- [ ] **Step 2: Verify no other hardcoded payment_method_types exist**

Run: `grep -rn "payment_method_types" api/`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add api/create-subscription.js
git commit -m "feat: enable Apple Pay + Google Pay on subscription checkout"
```

---

### Task 2: Add Payment Request Button to Booking Payment Modal

**Files:**
- Modify: `index.html` — the `showPaymentModal` function (lines 3840-3883) and add Payment Request Button logic

- [ ] **Step 1: Add Payment Request Button div to the modal HTML**

In `index.html`, find the `showPaymentModal` function (line 3840). Replace the entire `modal.innerHTML` template (lines 3847-3865) with the new version that includes a `#payment-request-button` div and a separator above the card element:

Find this block (lines 3847-3865):
```javascript
  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:18px;font-weight:700;color:#0D1F3C">Payment</div>
          <div style="font-size:13px;color:#6B7280;margin-top:2px">${bkg.service_name} · $${price}</div>
        </div>
        <button onclick="document.getElementById('payment-modal').remove()" style="background:#F7F8FA;border:none;border-radius:50%;width:34px;height:34px;font-size:18px;cursor:pointer">&#x2715;</button>
      </div>
      <div id="stripe-card-element" style="border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:16px;font-size:16px"></div>
      <div id="stripe-error" style="color:#DC2626;font-size:13px;margin-bottom:12px;display:none"></div>
      <button id="pay-btn" onclick="processPayment('${bkg.id}',${price})" style="width:100%;background:#1848C8;color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
        Pay $${price} AUD
      </button>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#9CA3AF">🔒 Secured by Stripe · Card charged after service</div>
      <div style="position:relative;z-index:100;margin-top:10px">
        <button onclick="skipPayment('${bkg.id}')" style="display:block;width:100%;background:none;border:1px solid #E5E7EB;border-radius:8px;color:#6B7280;font-size:13px;padding:10px;cursor:pointer;font-family:Inter,sans-serif">💵 Pay cash on the day instead</button>
        <button onclick="cancelBookingModal('${bkg.id}')" style="display:block;width:100%;background:none;border:none;color:#DC2626;font-size:12px;margin-top:6px;cursor:pointer;font-family:Inter,sans-serif">← Cancel and go back</button>
      </div>
    </div>`;
```

Replace with:
```javascript
  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:18px;font-weight:700;color:#0D1F3C">Payment</div>
          <div style="font-size:13px;color:#6B7280;margin-top:2px">${esc(bkg.service_name)} · $${price}</div>
        </div>
        <button onclick="document.getElementById('payment-modal').remove()" style="background:#F7F8FA;border:none;border-radius:50%;width:34px;height:34px;font-size:18px;cursor:pointer">&#x2715;</button>
      </div>
      <div id="payment-request-button" style="margin-bottom:16px"></div>
      <div id="pr-separator" style="display:none;text-align:center;margin-bottom:16px;position:relative">
        <span style="background:#fff;padding:0 12px;font-size:12px;color:#9CA3AF;position:relative;z-index:1">or pay with card</span>
        <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#E5E7EB;z-index:0"></div>
      </div>
      <div id="stripe-card-element" style="border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:16px;font-size:16px"></div>
      <div id="stripe-error" style="color:#DC2626;font-size:13px;margin-bottom:12px;display:none"></div>
      <button id="pay-btn" onclick="processPayment('${bkg.id}',${price})" style="width:100%;background:#1848C8;color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
        Pay $${price} AUD
      </button>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:#9CA3AF">🔒 Secured by Stripe · Card charged after service</div>
      <div style="position:relative;z-index:100;margin-top:10px">
        <button onclick="skipPayment('${bkg.id}')" style="display:block;width:100%;background:none;border:1px solid #E5E7EB;border-radius:8px;color:#6B7280;font-size:13px;padding:10px;cursor:pointer;font-family:Inter,sans-serif">Pay cash on the day instead</button>
        <button onclick="cancelBookingModal('${bkg.id}')" style="display:block;width:100%;background:none;border:none;color:#DC2626;font-size:12px;margin-top:6px;cursor:pointer;font-family:Inter,sans-serif">Cancel and go back</button>
      </div>
    </div>`;
```

Changes vs original:
- Added `<div id="payment-request-button">` (empty, Stripe mounts into it)
- Added `<div id="pr-separator">` with "or pay with card" text (hidden by default, shown only if wallet available)
- Used `esc(bkg.service_name)` for XSS safety (esc() already exists in index.html)

- [ ] **Step 2: Add Payment Request Button initialization after Stripe card mount**

Find the try/catch block at lines 3869-3883 that mounts the Card Element. Replace the entire block:

From:
```javascript
  // Mount Stripe element
  try {
    const stripeInstance = getStripe();
    if(stripeInstance){
      const elements = stripeInstance.elements();
      window._stripeCard = elements.create('card', {
        style: { base: { fontSize:'16px', color:'#0D1F3C', fontFamily:'Inter,sans-serif', '::placeholder':{ color:'#9CA3AF' } } }
      });
      window._stripeCard.mount('#stripe-card-element');
    } else {
      document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
    }
  } catch(e) {
    document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
  }
```

To:
```javascript
  // Mount Stripe element + Payment Request Button (Apple Pay / Google Pay)
  try {
    const stripeInstance = getStripe();
    if(stripeInstance){
      const elements = stripeInstance.elements();
      window._stripeCard = elements.create('card', {
        style: { base: { fontSize:'16px', color:'#0D1F3C', fontFamily:'Inter,sans-serif', '::placeholder':{ color:'#9CA3AF' } } }
      });
      window._stripeCard.mount('#stripe-card-element');

      // Payment Request Button (Apple Pay / Google Pay)
      const paymentRequest = stripeInstance.paymentRequest({
        country: 'AU',
        currency: 'aud',
        total: { label: bkg.service_name || 'Dr. Bike Sydney', amount: Math.round(price * 100) },
        requestPayerName: true,
        requestPayerEmail: true,
      });

      const prButton = elements.create('paymentRequestButton', { paymentRequest });

      paymentRequest.canMakePayment().then(result => {
        if(result){
          prButton.mount('#payment-request-button');
          document.getElementById('pr-separator').style.display = 'block';
        }
      });

      paymentRequest.on('paymentmethod', async (ev) => {
        try {
          await sb.from('bookings').update({
            status: 'confirmed',
            payment_method_id: ev.paymentMethod.id
          }).eq('id', bkg.id);
          ev.complete('success');
          document.getElementById('payment-modal')?.remove();

          // Send confirmation email (same as processPayment)
          const {data:bkgData} = await sb.from('bookings').select('*').eq('id', bkg.id).single();
          if(bkgData){
            fetch('/api/send-email', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({
                to: currentUser?.email,
                name: userProfile?.full_name || currentUser?.email?.split('@')[0],
                service: bkgData.service_name,
                date: new Date(bkgData.scheduled_date+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}),
                time: bkgData.scheduled_time,
                address: bkgData.address,
                price: bkgData.service_price,
                type: 'confirmation',
                bookingId: bkgData.id,
                referralCode: userProfile?.referral_code
              })
            }).catch(()=>{});
          }
          showBookingSuccess();
        } catch(err) {
          ev.complete('fail');
          toast('Payment failed. Please try with card.', 'error');
        }
      });

    } else {
      document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
    }
  } catch(e) {
    document.getElementById('stripe-card-element').innerHTML = '<div style="padding:12px;color:#DC2626;font-size:13px">Card payment unavailable. Please use cash.</div>';
  }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add Apple Pay / Google Pay Payment Request Button to booking modal"
```

---

### Task 3: Manual Testing

No automated tests (this is a vanilla JS PWA with no test framework). Manual verification required.

- [ ] **Step 1: Test subscription flow**

1. Open https://drbikesydney.com.au in Safari on iPhone (or Chrome on Android)
2. Navigate to Membership section
3. Select any plan and click Subscribe
4. Verify the Stripe Checkout page shows Apple Pay / Google Pay button at the top
5. Verify card payment still works as fallback

- [ ] **Step 2: Test booking payment modal (Apple Pay device)**

1. Open https://drbikesydney.com.au on Safari/iOS with Apple Wallet configured
2. Book a service (any service, any date/time)
3. Verify the payment modal shows the Apple Pay button above the card form
4. Verify the "or pay with card" separator is visible
5. Tap Apple Pay, authenticate with Face ID / Touch ID
6. Verify booking status updates to `confirmed` in Supabase
7. Verify confirmation email arrives

- [ ] **Step 3: Test booking payment modal (no wallet device)**

1. Open https://drbikesydney.com.au on a desktop browser with no Google Pay configured
2. Book a service
3. Verify the payment modal shows ONLY the card form (no Apple Pay button, no separator)
4. Verify card payment works as before
5. Verify "Pay cash on the day instead" still works

- [ ] **Step 4: Test booking payment modal (Google Pay device)**

1. Open https://drbikesydney.com.au on Chrome/Android with Google Pay configured
2. Book a service
3. Verify the payment modal shows the Google Pay button
4. Tap Google Pay, authenticate
5. Verify booking confirms successfully

---

## Self-Review

**Spec coverage:**
- Subscriptions (Stripe Checkout) — Task 1 ✓
- Bookings (Payment Request Button) — Task 2 ✓
- Edge case: no wallet device — Task 2 (canMakePayment check) + Task 3 Step 3 ✓
- Edge case: AUD currency — Task 2 (hardcoded 'aud') ✓
- Edge case: amount in cents — Task 2 (`Math.round(price * 100)`) ✓
- No new files — ✓
- No new endpoints — ✓

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code is complete.

**Type consistency:** `bkg.id`, `bkg.service_name`, `price` — consistent with existing code. `paymentMethod.id` from Payment Request event matches the field saved to bookings (`payment_method_id`) same as the card flow.
