// Extracted from landing.html inline <script type="module"> tags
// (docs/PENDIENTES.md 3.2). 2 blocks, original document order.


  (async () => {
    const GROWTHBOOK_CLIENT_KEY = 'sdk-2b80f2WSPv8Coa09';
    if (GROWTHBOOK_CLIENT_KEY === 'GROWTHBOOK_KEY_HERE') return;
    try {
      const { GrowthBook } = await import('https://cdn.jsdelivr.net/npm/@growthbook/growthbook/dist/bundles/esm.min.js');
      let anonId = localStorage.getItem('drbike-gb-id');
      if (!anonId) {
        anonId = 'gb-' + Math.random().toString(36).slice(2) + Date.now();
        localStorage.setItem('drbike-gb-id', anonId);
      }
      const gb = new GrowthBook({
        apiHost: 'https://cdn.growthbook.io',
        clientKey: GROWTHBOOK_CLIENT_KEY,
        attributes: { id: anonId },
        trackingCallback: (experiment, result) => {
          if (window.posthog) {
            posthog.capture('experiment_viewed', {
              experiment_id: experiment.key,
              variation_id: result.variationId,
            });
          }
        },
      });
      await gb.loadFeatures();
      window.__growthbook = gb;
      document.dispatchEvent(new Event('growthbook-ready'));
    } catch (e) {
      console.warn('[growthbook] failed to load:', e.message);
    }
  })();


  // No ?v= here on purpose: js/app.js imports './i18n.js', and a query makes
  // this a different module URL - two instances, two private currentLang
  // variables. setLang() would move this one and leave the copy app.js
  // translates with on the old language. Freshness comes from the sw.js cache
  // name instead (the file is served must-revalidate, so only the service
  // worker can hold an old copy).
  import { getLang, setLang, translateScreen, dateLocale, sourceOf, LANGUAGES } from './i18n.js';
  // Reused for the account panel's reschedule picker (10.2): this project has
  // shipped 3 production bugs from hand-rolled time conversion (12h label vs
  // 24h DB column vs HH:MM the endpoint validates - docs/PENDIENTES.md 22.1),
  // so the account panel's plain <script> below borrows the tested functions
  // through a global instead of re-deriving them. time-format.js has no
  // module-private state, unlike i18n.js, so loading it twice is harmless.
  import { toDbTime, toDisplayTime } from './time-format.js';
  window.__drbikeTime = { toDbTime: toDbTime, toDisplayTime: toDisplayTime };

  // One control instead of three loose links: the header showed English,
  // Español and 中文 all at once, which reads as navigation rather than as a
  // setting. setLang() is untouched - this is only how the three options are
  // presented. Options are buttons in a role="listbox", so Enter/Space work for
  // free; the extra keyboard wiring below is Escape, the arrows and closing on
  // an outside click.
  var LANG_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  var LANG_CARET = '<svg class="nav-lang-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var LANG_CHECK = '<svg class="nav-lang-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function renderLangSwitcher() {
    var wrap = document.getElementById('nav-lang-switcher');
    if (!wrap) return;
    var code = getLang();
    var current = LANGUAGES.filter(function(l) { return l.code === code; })[0] || LANGUAGES[0];

    wrap.innerHTML =
      '<button type="button" class="nav-lang-toggle" id="nav-lang-toggle" aria-haspopup="listbox" aria-expanded="false" aria-controls="nav-lang-menu" aria-label="Language">'
      + LANG_ICON + '<span>' + current.label + '</span>' + LANG_CARET
      + '</button>'
      + '<div class="nav-lang-menu" id="nav-lang-menu" role="listbox" aria-label="Language" hidden>'
      + LANGUAGES.map(function(l) {
          return '<button type="button" class="nav-lang-option" role="option" data-lang="' + l.code + '"'
            + ' aria-selected="' + (l.code === current.code) + '"><span>' + l.label + '</span>' + LANG_CHECK + '</button>';
        }).join('')
      + '</div>';

    var toggle = wrap.querySelector('#nav-lang-toggle');
    var menu = wrap.querySelector('#nav-lang-menu');
    var options = Array.prototype.slice.call(menu.querySelectorAll('.nav-lang-option'));

    // Bound on open and unbound on close: renderLangSwitcher() runs again on
    // every language change, so a listener left on document would pile up.
    function onOutside(e) {
      if (!wrap.contains(e.target)) closeMenu(false);
    }

    function openMenu(index) {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onOutside);
      var start = typeof index === 'number' ? index : Math.max(0, options.indexOf(wrap.querySelector('[aria-selected="true"]')));
      options[start].focus();
    }

    function closeMenu(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside);
      if (refocus) toggle.focus();
    }

    toggle.addEventListener('click', function() {
      if (menu.hidden) openMenu();
      else closeMenu(true);
    });
    toggle.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); openMenu(options.length - 1); }
    });

    options.forEach(function(opt, i) {
      opt.addEventListener('click', function() {
        closeMenu(false);
        // Re-renders this switcher (langchange), so focus would be lost on a
        // detached node - put it back on the control the user was using.
        setLang(opt.dataset.lang);
        var next = document.getElementById('nav-lang-toggle');
        if (next) next.focus();
      });
      opt.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); options[(i + 1) % options.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
        else if (e.key === 'Tab') closeMenu(false);
      });
    });
  }

  function translateAll() {
    translateScreen(document.body);
  }

  renderLangSwitcher();
  translateAll();

  document.addEventListener('langchange', function() {
    renderLangSwitcher();
    translateAll();
  });

  // Re-translate after any dynamic re-render that injects new English text
  // (booking wizard steps, mechanic carousel, account panel, modals, chat,
  // FAQ bot). A MutationObserver on the whole body catches every innerHTML
  // swap without needing to hook each render function individually.
  // Uses setTimeout rather than requestAnimationFrame for the debounce -
  // rAF is throttled/never fires on backgrounded or unfocused tabs (verified
  // in testing), which would silently stop translations from applying.
  var _i18nDebounce = null;
  var _bodyObserver = new MutationObserver(function() {
    if (_i18nDebounce) return;
    _i18nDebounce = setTimeout(function() {
      _i18nDebounce = null;
      translateAll();
    }, 0);
  });
  _bodyObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Object.assign, not a plain overwrite: js/app.js also loads on this page
  // and publishes the same global, and whichever module evaluates second must
  // not wipe out the other one's helpers.
  window.__drbikeI18n = Object.assign(window.__drbikeI18n || {}, {
    getLang: getLang, setLang: setLang, translateScreen: translateScreen,
    dateLocale: dateLocale, sourceOf: sourceOf,
  });