// js/reviews-page.js - drbikesydney.com.au/reviews (reviews.html).
//
// Reads every published review from the public_reviews view with the anon key
// (same read js/landing-inline.js does), and posts new ones to
// /api/auth?role=site-review (api/_site-reviews.js), which checks Turnstile,
// the photos and a daily cap, and publishes at once.
//
// Translation: only the page's own chrome is passed through translateScreen()
// - the elements marked data-i18n. A review is somebody's words: a short one
// like "Excellent" would otherwise match a dictionary key and be "translated".
import {
  getLang,
  setLang,
  ensureLang,
  translateScreen,
  translateValue,
  dateLocale,
} from './i18n.js';

const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

// The server's caps (api/_site-reviews.js). The page shrinks each photo until
// it fits, so a reviewer never meets these numbers.
const MAX_PHOTOS = 6;
const PHOTO_MAX_BYTES = 400_000;
const THUMB_MAX_BYTES = 48_000;
const AVATARS = [
  'var(--blue-deep)',
  'var(--green)',
  'var(--purple)',
  'var(--amber)',
  'var(--cyan)',
];

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const thumbOf = (url) => String(url).replace(/\.jpg$/, '_t.jpg');

let reviews = [];
let rating = 0;
const photos = []; // { data, thumb, preview }
let loadFailed = false;

function starWord(n) {
  return [
    '',
    translateValue('Terrible'),
    translateValue('Poor'),
    translateValue('Okay'),
    translateValue('Good'),
    translateValue('Excellent'),
  ][n];
}

function counted(n) {
  return translateValue(n === 1 ? '{n} review' : '{n} reviews').replace('{n}', n);
}

function timeAgo(iso) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const rtf = new Intl.RelativeTimeFormat(dateLocale(), { numeric: 'auto' });
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 60) return rtf.format(-Math.floor(days / 7), 'week');
  if (days < 365) return rtf.format(-Math.floor(days / 30), 'month');
  return rtf.format(-Math.floor(days / 365), 'year');
}

function translateChrome() {
  document.querySelectorAll('[data-i18n]').forEach((el) => translateScreen(el));
  document.querySelectorAll('.lang button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
  });
}

// ── The list and the summary ────────────────────────────────────────────────

function reviewHTML(r, i) {
  const n = Math.max(1, Math.min(5, Number(r.rating) || 5));
  const name = r.display_name || 'Dr. Bike client';
  const pics = (r.photos || [])
    .map(
      (u) =>
        `<button type="button" data-full="${esc(u)}" aria-label="${esc(translateValue('Open photo'))}"><img src="${esc(thumbOf(u))}" alt="" width="96" height="96" loading="lazy" decoding="async"></button>`
    )
    .join('');
  return `<article class="rv">
      <div class="rv-head">
        <div class="avatar" style="background:${AVATARS[i % AVATARS.length]}">${esc(name.charAt(0).toUpperCase())}</div>
        <div style="min-width:0">
          <div class="rv-name">${esc(name)}</div>
          <div class="rv-meta"><span>${esc(timeAgo(r.completed_at))}</span>${r.verified ? `<span class="badge">${esc(translateValue('Verified booking'))}</span>` : ''}</div>
        </div>
      </div>
      <div class="rv-stars" role="img" aria-label="${esc(translateValue(`${n} out of 5 stars`))}">${starText(n)}</div>
      <p class="rv-text">${esc(r.comment)}</p>
      ${pics ? `<div class="rv-photos">${pics}</div>` : ''}
    </article>`;
}

function renderList() {
  const list = $('rv-list');
  if (loadFailed) {
    list.innerHTML = `<div class="empty">${esc(translateValue('Could not load the reviews. Please refresh the page.'))}</div>`;
  } else if (!reviews.length) {
    list.innerHTML = `<div class="empty"><strong>${esc(translateValue('No reviews here yet'))}</strong>${esc(translateValue('Be the first to write one.'))}</div>`;
  } else {
    list.innerHTML = reviews.map(reviewHTML).join('');
  }

  const row = $('rv-sum-row');
  if (!reviews.length) {
    row.hidden = true;
    return;
  }
  const total = reviews.length;
  const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total;
  $('rv-avg').textContent = avg.toFixed(1);
  $('rv-avg-stars').textContent = starText(Math.round(avg));
  $('rv-count').textContent = counted(total);
  $('rv-bars').innerHTML = [5, 4, 3, 2, 1]
    .map((s) => {
      const c = reviews.filter((r) => Number(r.rating) === s).length;
      return `<div class="bar"><span style="width:10px">${s}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((c / total) * 100)}%"></div></div><span style="width:22px;text-align:right">${c}</span></div>`;
    })
    .join('');
  row.hidden = false;
}

async function loadReviews() {
  const url = (cols) =>
    `${SUPABASE_URL}/rest/v1/public_reviews?select=${cols}&order=completed_at.desc&limit=200`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  try {
    let r = await fetch(url('id,display_name,rating,comment,completed_at,photos,verified'), {
      headers,
    });
    // Before scripts/create-public-reviews-view.sql is re-run the view has no
    // photos/verified columns, and asking for them is a 400.
    if (r.status === 400)
      r = await fetch(url('id,display_name,rating,comment,completed_at'), { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    reviews = (await r.json()) || [];
  } catch (e) {
    console.error('[reviews] could not load:', e.message);
    loadFailed = true;
  }
  renderList();
}

// ── The form ────────────────────────────────────────────────────────────────

function paintStars() {
  document.querySelectorAll('#rv-stars-pick [data-star]').forEach((b) => {
    const on = Number(b.dataset.star) <= rating;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(Number(b.dataset.star) === rating));
  });
  $('rv-star-word').textContent = starWord(rating);
}

function showError(msg) {
  const el = $('rv-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function toJpeg(file, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(src);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('unreadable image'));
    };
    img.src = src;
  });
}

const bytesOf = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

async function fit(file, steps, max) {
  for (const [px, q] of steps) {
    const d = await toJpeg(file, px, q);
    if (bytesOf(d) <= max) return d;
  }
  return null;
}

function renderPhotos() {
  const grid = $('rv-photo-grid');
  grid.querySelectorAll('.photo-tile').forEach((t) => t.remove());
  const add = $('rv-photo-add');
  photos.forEach((p, i) => {
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    tile.innerHTML = `<img src="${p.preview}" alt=""><button type="button" data-remove="${i}" aria-label="${esc(translateValue('Remove photo'))}">&times;</button>`;
    grid.insertBefore(tile, add);
  });
  add.hidden = photos.length >= MAX_PHOTOS;
}

async function addPhotos(files) {
  showError('');
  const room = MAX_PHOTOS - photos.length;
  if (files.length > room) showError(translateValue('Up to 6 photos, please.'));
  for (const file of [...files].slice(0, room)) {
    try {
      const data = await fit(
        file,
        [
          [1280, 0.8],
          [1080, 0.72],
          [960, 0.62],
          [800, 0.55],
        ],
        PHOTO_MAX_BYTES
      );
      const thumb = await fit(
        file,
        [
          [320, 0.7],
          [240, 0.6],
        ],
        THUMB_MAX_BYTES
      );
      if (!data) throw new Error('too large even when shrunk');
      photos.push({ data, thumb, preview: thumb || data });
    } catch (e) {
      console.warn('[reviews] photo skipped:', e.message);
      showError(translateValue('That photo could not be read. Please try another.'));
    }
  }
  renderPhotos();
}

async function submit(e) {
  e.preventDefault();
  showError('');
  const name = $('rv-name').value.trim();
  const comment = $('rv-comment').value.trim();
  const email = $('rv-email').value.trim();
  if (!rating) return showError(translateValue('Please choose from 1 to 5 stars.'));
  if (!name) return showError(translateValue('Please add your name.'));
  if (comment.length < 3)
    return showError(translateValue('Please write a few words about the service.'));
  // The widget solves in the background; its token lands in a hidden input.
  const token =
    document.querySelector('#rv-turnstile input[name="cf-turnstile-response"]')?.value || '';
  if (!token)
    return showError(
      translateValue('Please wait a moment for the security check to finish, then try again.')
    );

  const btn = $('rv-submit');
  btn.disabled = true;
  btn.textContent = translateValue('Posting...');
  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'site-review',
        rating,
        name,
        comment,
        email,
        lang: getLang(),
        photos: photos.map((p) => ({ data: p.data, thumb: p.thumb })),
        turnstileToken: token,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
    $('rv-form').hidden = true;
    $('rv-done').hidden = false;
    $('rv-done-photos').hidden = !(data.photosDropped > 0);
    if (data.review) {
      loadFailed = false;
      reviews = [data.review, ...reviews];
      renderList();
    }
    $('write').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('[reviews] post failed:', err.message);
    showError(
      /^HTTP|Failed to fetch|NetworkError/i.test(err.message)
        ? translateValue('Connection error. Please try again.')
        : translateValue(err.message)
    );
    btn.disabled = false;
    btn.textContent = translateValue('Post review');
    // Turnstile tokens are single-use - a retry needs a fresh one.
    try {
      window.turnstile?.reset('#rv-turnstile');
    } catch (e2) {
      console.warn('[turnstile] reset failed:', e2.message);
    }
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function wire() {
  $('rv-stars-pick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    rating = Number(b.dataset.star);
    paintStars();
  });
  $('rv-comment').addEventListener('input', (e) => {
    $('rv-chars').textContent = e.target.value.length;
  });
  $('rv-photo-inp').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files?.length) await addPhotos(files);
    e.target.value = '';
  });
  $('rv-photo-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    photos.splice(Number(b.dataset.remove), 1);
    renderPhotos();
  });
  $('rv-form').addEventListener('submit', submit);

  const box = $('rv-lightbox');
  const close = () => {
    box.hidden = true;
    $('rv-lightbox-img').removeAttribute('src');
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-full]');
    if (b) {
      $('rv-lightbox-img').src = b.dataset.full;
      box.hidden = false;
      $('rv-lightbox-close').focus();
    } else if (e.target === box) close();
  });
  $('rv-lightbox-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) close();
  });

  document.querySelector('.lang').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    await setLang(b.dataset.lang);
  });
  document.addEventListener('langchange', () => {
    translateChrome();
    paintStars();
    renderPhotos();
    renderList();
  });
}

await ensureLang(getLang());
wire();
translateChrome();
loadReviews();
