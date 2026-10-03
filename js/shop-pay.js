// js/shop-pay.js - pagar un pedido de la tienda LEBYCLE. Lo usan las dos
// tiendas: shop.html (escritorio) y la pantalla de pago del SPA.
//
// Tres pasos, siempre en este orden:
//   1. startCheckout  - el servidor pone los precios, escribe el pedido y crea
//                        el cobro. Contesta la clave publica y el clientSecret.
//   2. mountCard/pay  - la tarjeta va directo del navegador a Stripe. Nunca
//                        pasa por nuestro servidor.
//   3. confirmOrder   - el servidor le pregunta a Stripe si de verdad se cobro,
//                        marca el pedido pagado y manda los avisos.
//
// NO usa js/stripe.js a proposito: ese archivo trae escrita la clave LIVE del
// negocio, y la tienda cobra con la suya (SHOP_STRIPE_* en Vercel, hoy de
// pruebas). El campo de la tarjeta tiene que hablar con la misma cuenta y el
// mismo modo que crearon el cobro, o Stripe lo rechaza al pagar.

const STRIPE_JS = 'https://js.stripe.com/v3/';
const instances = new Map();

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  const existing = document.querySelector(`script[src="${STRIPE_JS}"]`);
  return new Promise((resolve, reject) => {
    const s = existing || Object.assign(document.createElement('script'), { src: STRIPE_JS });
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () =>
      reject(new Error('The card form could not load. Check your connection and try again.'))
    );
    if (!existing) document.head.appendChild(s);
  });
}

// El campo vive en un iframe de Stripe, al que no llega ninguna hoja de estilo
// nuestra: los colores se le pasan a mano. Se leen de css/variables.css en vez
// de escribirlos, asi el formulario no suma hex sueltos (scripts/color-check.mjs).
// 16px no es estetica: con menos, Safari en iPhone agranda la pagina al tocar
// el campo y no la vuelve a achicar (ver js/stripe.js).
function cardStyle() {
  const css = window.getComputedStyle(document.documentElement);
  const tok = (name) => css.getPropertyValue(name).trim() || undefined;
  return {
    base: {
      color: tok('--navy'),
      iconColor: tok('--gray'),
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: '16px',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: tok('--gray-lt') },
    },
    invalid: { color: tok('--red'), iconColor: tok('--red') },
  };
}

async function postShop(token, body) {
  const r = await fetch('/api/shop?action=' + body.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong (' + r.status + '). Try again.');
  return data;
}

// details: { name, email, phone, address, suburb, postcode }. Los importes no
// viajan: el servidor los recalcula y contesta lo que de verdad va a cobrar.
export function startCheckout(token, items, details, lang) {
  return postShop(token, { action: 'checkout', items, ...details, lang });
}

export function confirmOrder(token, orderId, lang) {
  return postShop(token, { action: 'confirm', orderId, lang });
}

// Dibuja los tres campos (numero, vencimiento, CVC) dentro de `host`. Separados
// y no el campo combinado de Stripe: en un telefono, el combinado muestra solo
// el numero hasta que es valido, y parece un formulario roto ("solo aparece el
// numero, no los otros 2" - Diego, sobre el pago de reservas).
export async function mountCard(host, publishableKey, lang) {
  await loadStripeJs();
  const locale = lang === 'es' || lang === 'zh' ? lang : 'en';
  const id = publishableKey + '|' + locale;
  if (!instances.has(id)) instances.set(id, window.Stripe(publishableKey, { locale }));
  const stripe = instances.get(id);

  host.innerHTML = `
    <div class="shop-cardform__field" data-card="number"></div>
    <div class="shop-cardform__row">
      <div class="shop-cardform__field" data-card="expiry"></div>
      <div class="shop-cardform__field" data-card="cvc"></div>
    </div>`;
  const style = cardStyle();
  const elements = stripe.elements();
  const number = elements.create('cardNumber', { style, showIcon: true });
  const expiry = elements.create('cardExpiry', { style });
  const cvc = elements.create('cardCvc', { style });
  number.mount(host.querySelector('[data-card="number"]'));
  expiry.mount(host.querySelector('[data-card="expiry"]'));
  cvc.mount(host.querySelector('[data-card="cvc"]'));

  return {
    // Devuelve el estado del cobro segun Stripe. Si el banco pide 3D Secure,
    // Stripe abre su ventana aca mismo y esta promesa espera a que termine.
    async pay(clientSecret, billing) {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: number, billing_details: billingDetails(billing) },
      });
      if (error) {
        // Un segundo toque sobre un cobro que ya paso: no es un error, ya esta.
        if (error.payment_intent?.status === 'succeeded') return 'succeeded';
        throw new Error(error.message || 'The card was not accepted.');
      }
      return paymentIntent?.status || 'processing';
    },
    destroy() {
      number.destroy();
      expiry.destroy();
      cvc.destroy();
      host.innerHTML = '';
    },
  };
}

// Stripe rechaza un email vacio como "invalido", asi que lo que no se escribio
// no se manda.
function billingDetails(b = {}) {
  const out = {};
  if (b.name) out.name = b.name;
  if (b.email) out.email = b.email;
  if (b.phone) out.phone = b.phone;
  const address = {};
  if (b.address) address.line1 = b.address;
  if (b.suburb) address.city = b.suburb;
  if (b.postcode) address.postal_code = b.postcode;
  if (Object.keys(address).length) out.address = { ...address, country: 'AU' };
  return out;
}
