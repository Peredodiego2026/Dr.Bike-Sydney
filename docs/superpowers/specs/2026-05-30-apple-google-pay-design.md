# Apple Pay + Google Pay — Dr. Bike Sydney

## Goal

Enable Apple Pay and Google Pay across both payment flows (subscriptions and per-service bookings) to reduce friction and increase conversion.

## Architecture

Two independent changes that share no code:

1. **Subscriptions (Stripe Checkout hosted):** Remove the `payment_method_types: ['card']` restriction so Stripe auto-enables all methods configured in the Dashboard (card, Apple Pay, Google Pay, Link).

2. **Bookings (in-app modal):** Add a Stripe Payment Request Button above the existing Card Element. The button auto-detects device wallet support (Apple Pay on Safari/iOS, Google Pay on Chrome/Android). If unsupported, it hides and the card form remains the only option.

## Prerequisites

- Domain `drbikesydney.com.au` is already verified in Stripe Dashboard for Apple Pay.
- Stripe publishable key (`pk_live_...`) already loaded via `<script src="https://js.stripe.com/v3/">` in index.html.
- No new backend endpoints needed — the Payment Request Button generates a `paymentMethod` client-side, same as the Card Element does today.

## Changes

### 1. Subscriptions — `api/create-subscription.js`

**Current (line 51):**
```javascript
payment_method_types: ['card'],
```

**New:** Remove this line entirely. When omitted, Stripe Checkout shows all payment methods enabled in the Stripe Dashboard automatically — including Apple Pay, Google Pay, and Link.

### 2. Bookings — `index.html` (showPaymentModal function)

**Current flow:** `showPaymentModal(bookingId, amount, label)` creates a modal with a Card Element, user fills card, clicks Confirm, `createPaymentMethod` is called, payment method ID is saved to the booking.

**New flow:**
1. Create a `stripe.paymentRequest({ country: 'AU', currency: 'aud', total: { label, amount: amountInCents } })`.
2. Call `paymentRequest.canMakePayment()` — returns truthy if device supports a wallet.
3. If supported: render a `<div id="payment-request-button">` above the card form with a horizontal separator ("or pay with card"). Mount the Payment Request Button element into it.
4. If not supported: hide the div, show only the card form (identical to current UX).
5. Listen to `paymentRequest.on('paymentmethod', ...)` — when the user authenticates with Face ID / fingerprint, extract `paymentMethod.id` and save to booking (same as the card flow's `confirmCardPayment`).
6. Call `ev.complete('success')` or `ev.complete('fail')` to close the native payment sheet.

**Modal layout:**
```
+----------------------------------+
|  Pay for [service] - $[amount]   |
|                                  |
|  [====== Apple Pay ======]       |  <- Only visible if canMakePayment()
|                                  |
|  ── or pay with card ──          |  <- Separator (hidden if no wallet)
|                                  |
|  [  Card number input  ]        |  <- Existing Card Element
|  [    Confirm $XXX     ]        |  <- Existing confirm button
|                                  |
|  Secured by Stripe               |
+----------------------------------+
```

### 3. No new files

No new API endpoints, no new HTML pages, no new dependencies.

## Edge Cases

- **Device without wallet:** Payment Request Button div stays hidden. Card form is the only option. Zero UX difference from today.
- **Currency:** Hardcoded to AUD. Dr. Bike only operates in Sydney.
- **Amount format:** Stripe Payment Request expects amount in cents (e.g., $109 = 10900). The current modal receives price as dollars — multiply by 100.
- **Refunds:** Work identically to card refunds via Stripe Dashboard.
- **Tips:** If tips use the same payment modal, they also get Apple Pay / Google Pay automatically.
- **Subscription webhooks:** No change — stripe-webhook.js already handles all subscription events regardless of payment method.

## Testing

- **Apple Pay:** Requires Safari on macOS/iOS with a card in Apple Wallet. Can test with Stripe test mode + Apple Pay sandbox.
- **Google Pay:** Requires Chrome on Android or desktop with a card in Google Pay. Works in Stripe test mode.
- **Fallback:** Test on a device/browser without any wallet configured — must show card-only modal with no errors.
- **Subscription flow:** After removing `payment_method_types`, verify Stripe Checkout page shows Apple Pay / Google Pay buttons on supported devices.

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `api/create-subscription.js` | Remove `payment_method_types: ['card']` | 1 line removed |
| `index.html` | Modify `showPaymentModal()` to add Payment Request Button + handler | ~40 lines added |
