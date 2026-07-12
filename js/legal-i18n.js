// js/legal-i18n.js — translation mechanism for standalone legal pages
// (terms.html, privacy.html). Reuses the same language choice (localStorage
// key) as the main app's js/i18n.js so switching language anywhere on the
// site is consistent, but keeps its own per-page dictionary since legal
// prose is page-specific and would bloat the shared app dict otherwise.
//
// Unlike the app's translateScreen() (exact text-node matching, built for
// short UI labels), this swaps innerHTML per data-i18n block - simpler and
// more robust for long paragraphs that contain inline <a>/<strong> tags.

import { LANGUAGES, getLang, setLang } from './i18n.js';

export function renderLangSwitcher() {
  const current = getLang();
  return `<div id="legal-lang-switcher" style="display:flex;gap:6px">${LANGUAGES.map(
    (l) =>
      `<button type="button" data-lang="${l.code}" class="legal-lang-btn" style="padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid ${l.code === current ? '#2563eb' : '#e5e7eb'};background:${l.code === current ? '#eff6ff' : '#fff'};color:${l.code === current ? '#2563eb' : '#374151'}">${l.code.toUpperCase()}</button>`
  ).join('')}</div>`;
}

function paintSwitcher() {
  const current = getLang();
  document.querySelectorAll('.legal-lang-btn').forEach((btn) => {
    const active = btn.dataset.lang === current;
    btn.style.borderColor = active ? '#2563eb' : '#e5e7eb';
    btn.style.background = active ? '#eff6ff' : '#fff';
    btn.style.color = active ? '#2563eb' : '#374151';
  });
}

function applyTranslations(dict) {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (!el.dataset.i18nOrig) el.dataset.i18nOrig = el.innerHTML;
    el.innerHTML =
      lang === 'en' ? el.dataset.i18nOrig : dict[lang]?.[el.dataset.i18n] || el.dataset.i18nOrig;
  });
  const banner = document.getElementById('mt-disclaimer');
  if (banner) banner.hidden = lang === 'en';
}

export function initLegalPage(dict) {
  applyTranslations(dict);
  paintSwitcher();
  document.querySelectorAll('.legal-lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      paintSwitcher();
      applyTranslations(dict);
    });
  });
}
