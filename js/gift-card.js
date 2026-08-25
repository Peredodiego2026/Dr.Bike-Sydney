// The gift card modal, built once for both surfaces.
//
// It used to be ~30 lines of markup inlined in landing.html plus its own
// handlers in js/landing-inline.js, which meant the mobile SPA had no gift
// card at all - `grep -c gift index.html js/app.js` returned 0. That is the
// same shape as four other bugs this month (the "Trusted by" bar, the fee-check
// dead end, four separate call-out fee calculators, an unreachable Profile
// screen): a feature wired on one surface and not the other. Building it here
// and opening it from both is the only version of this that cannot drift.
import { translateValue } from './i18n.js';

const PRESETS = [50, 100, 150, 200];
const MIN = 20;
const MAX = 1000;

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const t = (s) => esc(translateValue(s));

export function openGiftCardModal() {
  document.getElementById('gift-scrim')?.remove();

  let amount = 100;

  const scrim = document.createElement('div');
  scrim.id = 'gift-scrim';
  scrim.className = 'gift-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'gift-title');
  scrim.innerHTML = `
    <div class="gift-sheet">
      <div class="gift-head">
        <button class="gift-close" id="gift-close" aria-label="${t('Close')}">&times;</button>
        <h2 class="gift-title" id="gift-title">${t('Gift a service')}</h2>
        <p class="gift-sub">${t('Send a Dr. Bike gift card by email')}</p>
        <!-- The preview is the point of the 3D: it is the thing being bought,
             and it answers "what will they actually get?" without a word. -->
        <div class="gift-stage">
          <div class="gift-card3d" id="gift-preview">
            <img class="gift-card3d__mark" src="images/logo-db.png" alt="" aria-hidden="true">
            <div class="gift-card3d__wash" aria-hidden="true"></div>
            <div class="gift-card3d__shine" aria-hidden="true"></div>
            <div class="gift-card3d__brand">DR. BIKE SYDNEY</div>
            <div class="gift-card3d__amount" id="gift-preview-amount">$100</div>
            <div class="gift-card3d__row">
              <span class="gift-card3d__label">${t('Recipient')}</span>
              <span class="gift-card3d__value" id="gift-preview-to">&mdash;</span>
            </div>
            <div class="gift-card3d__row">
              <span class="gift-card3d__label">${t('Sender')}</span>
              <span class="gift-card3d__value" id="gift-preview-from">&mdash;</span>
            </div>
          </div>
        </div>
      </div>

      <div class="gift-body">
        <fieldset class="gift-field">
          <legend class="gift-label">${t('Amount')}</legend>
          <div class="gift-amounts" id="gift-amounts">
            ${PRESETS.map(
              (v) =>
                `<button type="button" class="gift-amt${v === amount ? ' is-on' : ''}" data-amt="${v}">$${v}</button>`
            ).join('')}
          </div>
          <label class="gift-custom">
            <span class="gift-custom__prefix" aria-hidden="true">$</span>
            <input id="gift-custom" type="number" inputmode="numeric" min="${MIN}" max="${MAX}"
              placeholder="${t('Another amount')}" aria-label="${t('Another amount')}">
          </label>
          <p class="gift-hint">${t('Between $20 and $1000.')}</p>
        </fieldset>

        <div class="gift-field">
          <label class="gift-label" for="gift-to-email">${t("Recipient's email")}</label>
          <input id="gift-to-email" type="email" maxlength="120" placeholder="ana@example.com">
          <p class="gift-hint">${t('We send the card straight to them.')}</p>
        </div>

        <div class="gift-field">
          <label class="gift-label" for="gift-to-name">${t("Recipient's name")}</label>
          <input id="gift-to-name" type="text" maxlength="80" placeholder="${t('Optional')}">
        </div>

        <div class="gift-field">
          <label class="gift-label" for="gift-from-name">${t('Your name')}</label>
          <input id="gift-from-name" type="text" maxlength="80" placeholder="${t('Optional')}">
        </div>

        <div class="gift-field">
          <label class="gift-label" for="gift-message">${t('Message')}</label>
          <textarea id="gift-message" maxlength="200" rows="2" placeholder="${t('Optional')}"></textarea>
        </div>

        <p class="gift-error" id="gift-error" role="alert" hidden></p>
      </div>

      <!-- Sticky, and that is the fix: the pay button used to sit at the end of
           a sheet taller than the phone, so on Diego's screen the modal ended
           at "Personal message" and there was no way to pay without knowing to
           scroll the backdrop. -->
      <div class="gift-foot">
        <button class="gift-submit" id="gift-submit">${t('Continue to payment')} &rarr;</button>
        <p class="gift-secure">${t('Secured by Stripe - delivered by email')}</p>
      </div>
    </div>`;
  document.body.appendChild(scrim);

  const $ = (id) => scrim.querySelector('#' + id);
  const custom = $('gift-custom');
  const errEl = $('gift-error');
  const submit = $('gift-submit');

  const currentAmount = () => {
    const typed = custom.value.trim();
    return typed ? Number(typed) : amount;
  };

  function paint() {
    const v = currentAmount();
    $('gift-preview-amount').textContent = Number.isFinite(v) && v > 0 ? '$' + v : '$--';
    $('gift-preview-to').textContent = $('gift-to-name').value.trim() || '—';
    $('gift-preview-from').textContent = $('gift-from-name').value.trim() || '—';
  }

  scrim.querySelectorAll('.gift-amt').forEach((b) => {
    b.addEventListener('click', () => {
      amount = Number(b.dataset.amt);
      custom.value = '';
      scrim.querySelectorAll('.gift-amt').forEach((x) => x.classList.toggle('is-on', x === b));
      paint();
    });
  });
  // Typing a custom amount deselects the presets - otherwise two amounts look
  // chosen at once and only one of them is the one being charged.
  custom.addEventListener('input', () => {
    if (custom.value.trim()) {
      scrim.querySelectorAll('.gift-amt').forEach((x) => x.classList.remove('is-on'));
    }
    paint();
  });
  $('gift-to-name').addEventListener('input', paint);
  $('gift-from-name').addEventListener('input', paint);

  const close = () => {
    scrim.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    const drop = () => scrim.remove();
    scrim.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 500);
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  $('gift-close').addEventListener('click', close);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);

  submit.addEventListener('click', async () => {
    const v = currentAmount();
    const email = $('gift-to-email').value.trim();
    const fail = (msg) => {
      errEl.textContent = translateValue(msg);
      errEl.hidden = false;
    };
    errEl.hidden = true;

    if (!Number.isFinite(v) || v < MIN || v > MAX) {
      fail('Choose an amount between $20 and $1000.');
      custom.focus();
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      fail("Enter the recipient's email.");
      $('gift-to-email').focus();
      return;
    }

    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = translateValue('Redirecting to payment...');
    try {
      const r = await fetch('/api/buy-gift-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: v,
          recipientEmail: email,
          recipientName: $('gift-to-name').value.trim(),
          senderName: $('gift-from-name').value.trim(),
          message: $('gift-message').value.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'Could not start checkout');
      window.location.href = d.url;
    } catch (e) {
      // Never a silent catch: the message is the only clue the buyer gets.
      fail(e.message || 'Something went wrong');
      submit.disabled = false;
      submit.textContent = original;
    }
  });

  paint();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      $('gift-close').focus();
    })
  );
}
