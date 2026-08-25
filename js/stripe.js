const STRIPE_KEY =
  'pk_live_51TUbFqPPGSm5cT7JKBDANyRVDmi6Ytia6r31kFxAEWis6xYZuhXlDnoZ3KyB4xUoJWd3nKpzrLxuDzsQEz7X3od3006xPoLzVV';

let _stripe = null;
let _card = null; // the cardNumber element - Stripe links its siblings
let _cardExpiry = null;
let _cardCvc = null;
let _prEl = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(s);
  });
}

export async function initStripe() {
  if (_stripe) return _stripe;
  if (!window.Stripe) await loadScript('https://js.stripe.com/v3/');
  _stripe = window.Stripe(STRIPE_KEY);
  return _stripe;
}

// Three boxes: number, expiry, CVC.
//
// This was Stripe's combined `card` element, which packs all three into one
// row and reveals them progressively - you see only the card number until you
// have typed a valid one, then expiry and CVC slide in. Stripe designed it
// that way, but on a phone it reads as a broken form: Diego reported "solo
// aparece el numero, no los otros 2".
//
// The split elements are the same integration - `confirmCardPayment` and
// `confirmCardSetup` take the cardNumber element and find its siblings, as
// long as all three come from the SAME `elements()` instance. Hence one
// `elements` here, kept together.
//
// fontSize is 16px and that is not cosmetic. Below 16px, iOS Safari zooms the
// whole page in when the field takes focus and does not zoom back out. The
// app-wide guard for that lives in css/fonts.css, but these inputs are inside
// Stripe's cross-origin iframe where no stylesheet of ours can reach - the
// only way in is this style object. It was 15px.
const CARD_STYLE = {
  base: {
    color: '#0D1F3C',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: '16px',
    fontSmoothing: 'antialiased',
    '::placeholder': { color: '#94A3B8' },
    iconColor: '#475569',
  },
  invalid: { color: '#EF4444', iconColor: '#EF4444' },
};

export async function createPaymentForm(containerId) {
  const stripe = await initStripe();
  destroyPaymentForm();

  const host = document.getElementById(containerId);
  if (!host) throw new Error(`Card container #${containerId} not found`);
  // Built here rather than in each caller's template so the two mount points
  // (the payment screen and the profile) cannot drift apart.
  host.innerHTML = `
    <div class="card-field" id="${containerId}-number-box"></div>
    <div class="card-element__row">
      <div class="card-field" id="${containerId}-expiry-box"></div>
      <div class="card-field" id="${containerId}-cvc-box"></div>
    </div>`;

  const elements = stripe.elements();
  _card = elements.create('cardNumber', { style: CARD_STYLE, showIcon: true });
  _cardExpiry = elements.create('cardExpiry', { style: CARD_STYLE });
  _cardCvc = elements.create('cardCvc', { style: CARD_STYLE });

  _card.mount(`#${containerId}-number-box`);
  _cardExpiry.mount(`#${containerId}-expiry-box`);
  _cardCvc.mount(`#${containerId}-cvc-box`);
  return _card;
}

export async function createPaymentRequestButton(
  containerId,
  { amountCents, label = 'Dr. Bike Sydney', onPayment }
) {
  const stripe = await initStripe();
  const container = document.getElementById(containerId);
  if (!container) return false;

  const pr = stripe.paymentRequest({
    country: 'AU',
    currency: 'aud',
    total: { label, amount: amountCents },
    requestPayerName: true,
    requestPayerEmail: true,
  });

  const canMake = await pr.canMakePayment();
  if (!canMake) return false;

  pr.on('paymentmethod', async (ev) => {
    try {
      await onPayment(ev.paymentMethod.id);
      ev.complete('success');
    } catch {
      ev.complete('fail');
    }
  });

  if (_prEl) {
    try {
      _prEl.destroy();
    } catch {}
  }
  const prElements = stripe.elements();
  _prEl = prElements.create('paymentRequestButton', {
    paymentRequest: pr,
    style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '48px' } },
  });
  _prEl.mount(`#${containerId}`);
  return true;
}

// `booking` carries what the booking is FOR - service, when, where, who - so
// that it rides along inside the PaymentIntent. Stripe hands it back on the
// payment_intent.succeeded webhook, which is what lets the server build the
// booking even if the customer's browser never comes back. On 2026-08-05 a
// browser did exactly that and a paid booking evaporated (docs/PENDIENTES.md
// section 14).
export async function processPayment(
  amountCents,
  bookingId,
  email,
  paymentMethodId = null,
  booking = null
) {
  const stripe = await initStripe();
  if (!_card && !paymentMethodId) throw new Error('Card element not ready');

  const resp = await fetch('/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: bookingId || 'demo',
      priceCents: amountCents,
      email,
      booking,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || 'Payment setup failed');
  }

  const { clientSecret, error: apiError } = await resp.json();
  if (apiError) throw new Error(apiError);

  const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: paymentMethodId || { card: _card },
  });

  if (error) throw new Error(error.message);
  if (paymentIntent.status !== 'succeeded')
    throw new Error('Payment incomplete. Please try again.');
  return paymentIntent;
}

// Confirms a SetupIntent (card-on-file save, no charge) against the card
// element mounted by createPaymentForm(). Mirrors processPayment()'s shape
// but for saving a card rather than charging one.
export async function confirmCardSetup(clientSecret) {
  const stripe = await initStripe();
  if (!_card) throw new Error('Card element not ready');
  const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
    payment_method: { card: _card },
  });
  if (error) throw new Error(error.message);
  if (setupIntent.status !== 'succeeded')
    throw new Error('Card could not be saved. Please try again.');
  return setupIntent;
}

export function destroyPaymentForm() {
  // All three, or a remount leaves orphaned iframes behind and Stripe warns
  // that the element is already mounted.
  for (const el of [_card, _cardExpiry, _cardCvc]) {
    if (!el) continue;
    try {
      el.destroy();
    } catch {}
  }
  _card = null;
  _cardExpiry = null;
  _cardCvc = null;
  if (_prEl) {
    try {
      _prEl.destroy();
    } catch {}
    _prEl = null;
  }
}

export async function createCheckoutSession({ amountCents, description, bookingId, email }) {
  const res = await fetch('/api/create-payment-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, priceCents: amountCents, description, email }),
  });
  if (!res.ok) throw new Error('Checkout session failed');
  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

export async function verifyCheckoutSession(sessionId) {
  const resp = await fetch('/api/create-payment-session?type=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!resp.ok) throw new Error('Could not verify payment');
  return resp.json();
}
