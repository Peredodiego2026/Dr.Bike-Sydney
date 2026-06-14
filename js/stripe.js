const STRIPE_KEY = 'pk_live_51TUbFqPPGSm5cT7JKBDANyRVDmi6Ytia6r31kFxAEWis6xYZuhXlDnoZ3KyB4xUoJWd3nKpzrLxuDzsQEz7X3od3006xPoLzVV';

let _stripe = null;
let _card = null;
let _prEl = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
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

export async function createPaymentForm(containerId) {
  const stripe = await initStripe();
  if (_card) { try { _card.destroy(); } catch {} _card = null; }

  const elements = stripe.elements();
  _card = elements.create('card', {
    hidePostalCode: true,
    style: {
      base: {
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '15px',
        fontSmoothing: 'antialiased',
        '::placeholder': { color: '#A0A0A0' },
        iconColor: '#A0A0A0',
      },
      invalid: { color: '#EF4444', iconColor: '#EF4444' },
    },
  });

  _card.mount(`#${containerId}`);
  return _card;
}

export async function createPaymentRequestButton(containerId, { amountCents, label = 'Dr. Bike Sydney', onPayment }) {
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

  pr.on('paymentmethod', async ev => {
    try {
      await onPayment(ev.paymentMethod.id);
      ev.complete('success');
    } catch {
      ev.complete('fail');
    }
  });

  if (_prEl) { try { _prEl.destroy(); } catch {} }
  const prElements = stripe.elements();
  _prEl = prElements.create('paymentRequestButton', {
    paymentRequest: pr,
    style: { paymentRequestButton: { type: 'buy', theme: 'dark', height: '48px' } },
  });
  _prEl.mount(`#${containerId}`);
  return true;
}

export async function processPayment(amountCents, bookingId, email, paymentMethodId = null) {
  const stripe = await initStripe();
  if (!_card && !paymentMethodId) throw new Error('Card element not ready');

  const resp = await fetch('/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: bookingId || 'demo', priceCents: amountCents, email }),
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
  if (paymentIntent.status !== 'succeeded') throw new Error('Payment incomplete. Please try again.');
  return paymentIntent;
}

export function destroyPaymentForm() {
  if (_card) { try { _card.destroy(); } catch {} _card = null; }
  if (_prEl) { try { _prEl.destroy(); } catch {} _prEl = null; }
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

