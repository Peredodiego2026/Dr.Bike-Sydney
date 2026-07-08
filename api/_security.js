// api/_security.js — Security middleware for all API endpoints
// Usage: import { guard, sanitize, rateLimit } from './_security.js';

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
// Primary: Upstash Redis (cross-instance, persistent) — requires env vars:
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Fallback: in-memory Map (per Vercel function instance)

const rateLimitStore = new Map();

function getClientIP(req) {
  return (
    req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

async function rateLimitRedis(limitKey, max, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // not configured — fall through to in-memory

  try {
    const windowSec = Math.ceil(windowMs / 1000);
    // Pipeline: INCR + EXPIRE in one round-trip
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', limitKey],
        ['EXPIRE', limitKey, windowSec, 'NX'],
      ]),
    });
    if (!resp.ok) return null;
    const [[, count]] = await resp.json();
    return count;
  } catch {
    return null; // Redis error — fall through to in-memory
  }
}

function rateLimitMemory(limitKey, max, windowMs) {
  const now = Date.now();
  if (!rateLimitStore.has(limitKey)) {
    rateLimitStore.set(limitKey, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  const entry = rateLimitStore.get(limitKey);
  if (now > entry.resetAt) {
    rateLimitStore.set(limitKey, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count++;
  return entry.count;
}

export async function rateLimit(req, res, { max = 20, windowMs = 60000, key = null } = {}) {
  const ip = getClientIP(req);
  const limitKey = key ? `rl:${ip}:${key}` : `rl:${ip}`;

  const count =
    (await rateLimitRedis(limitKey, max, windowMs)) ?? rateLimitMemory(limitKey, max, windowMs);

  if (count > max) {
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
    return true; // limited
  }

  return false;
}

// ── LOGIN LOCKOUT — failed PIN attempts per IP, DB-backed (cross-instance) ────
// Memory/Redis are per-instance/unreliable here, so lockout state lives in the
// `login_attempts` table (service-key only). 5 fails / 15 min → locked 15 min.
const LOCK_MAX = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_SB_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const lockKey = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

async function lockFetch(path, opts = {}) {
  return fetch(`${LOCK_SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: lockKey(),
      Authorization: `Bearer ${lockKey()}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

export const LOGIN_LOCK_MINUTES = LOCK_WINDOW_MS / 60000;

export async function isLoginLocked(req) {
  const ip = getClientIP(req);
  try {
    const r = await lockFetch(`login_attempts?ip=eq.${encodeURIComponent(ip)}&select=locked_until`);
    if (!r.ok) return false;
    const rows = await r.json();
    const lu = rows?.[0]?.locked_until;
    return !!(lu && new Date(lu) > new Date());
  } catch {
    return false;
  }
}

export async function recordLoginFailure(req) {
  const ip = getClientIP(req);
  try {
    const r = await lockFetch(`login_attempts?ip=eq.${encodeURIComponent(ip)}&select=*`);
    const rows = r.ok ? await r.json() : [];
    const now = Date.now();
    if (rows?.[0]) {
      const ws = new Date(rows[0].window_start).getTime();
      const fresh = now - ws > LOCK_WINDOW_MS;
      const count = fresh ? 1 : (rows[0].fail_count || 0) + 1;
      const window_start = fresh ? new Date(now).toISOString() : rows[0].window_start;
      const locked_until = count >= LOCK_MAX ? new Date(now + LOCK_WINDOW_MS).toISOString() : null;
      await lockFetch(`login_attempts?ip=eq.${encodeURIComponent(ip)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ fail_count: count, window_start, locked_until }),
      });
    } else {
      await lockFetch('login_attempts', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          ip,
          fail_count: 1,
          window_start: new Date(now).toISOString(),
          locked_until: null,
        }),
      });
    }
  } catch {}
}

export async function clearLoginFailures(req) {
  const ip = getClientIP(req);
  try {
    await lockFetch(`login_attempts?ip=eq.${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  } catch {}
}

// ── SANITIZE — strip HTML/script tags from strings ───────────────────────────
export function sanitize(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

export function sanitizeObj(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== undefined) result[field] = sanitize(String(result[field] ?? ''));
  }
  return result;
}

// ── CORS HEADERS — only allow requests from our domain ───────────────────────
const ALLOWED_ORIGINS = [
  'https://drbikesydney.com.au',
  'https://www.drbikesydney.com.au',
  'https://js.stripe.com',
  // localhost solo para dev — comentar en producción si es necesario
  // 'http://localhost:3000',
  // 'http://localhost:5173',
];

export function setCORSHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'https://drbikesydney.com.au');
  }
  // Si el origin no está en la lista, no agregar el header (evita duplicados)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ── GUARD — combined check: CORS + method + rate limit ───────────────────────
export async function guard(req, res, opts = {}) {
  setCORSHeaders(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // handled
  }

  // Method check
  const method = opts.method || 'POST';
  if (req.method !== method) {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  // Rate limit
  const limited = await rateLimit(req, res, {
    max: opts.rateMax || 30,
    windowMs: opts.rateWindow || 60000,
    key: opts.rateKey || null,
  });
  if (limited) return true;

  return false; // all good, proceed
}

// ── VALIDATE EMAIL ────────────────────────────────────────────────────────────
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

// ── NORMALIZE PHONE (AU) ─────────────────────────────────────────────────────
export function normalizeAUPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+61' + digits.slice(1);
  if (digits.length === 9) return '+61' + digits;
  return null;
}

// ── VALIDATE PHONE (AU) ───────────────────────────────────────────────────────
export function isValidAUPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return (
    (digits.startsWith('61') && digits.length === 11) ||
    (digits.startsWith('0') && digits.length === 10) ||
    digits.length === 9
  );
}

// ── STRIP SENSITIVE FIELDS from logs ─────────────────────────────────────────
export function safeLog(label, obj) {
  const safe = { ...obj };
  ['password', 'token', 'key', 'secret', 'auth', 'card', 'cvv', 'pan'].forEach((k) => {
    Object.keys(safe).forEach((f) => {
      if (f.toLowerCase().includes(k)) safe[f] = '[REDACTED]';
    });
  });
  console.log(label, JSON.stringify(safe));
}

// ── INTERNAL AUTH — verify requests come from our own domain ─────────────────
export function verifyInternalAuth(req, res) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const allowed = ['drbikesydney.com.au', 'dr-bike-sydney.vercel.app', 'localhost'];
  const isAllowed = allowed.some((d) => origin.includes(d) || referer.includes(d));
  if (!isAllowed && origin) {
    res.status(403).json({ error: 'Forbidden' });
    return true; // blocked
  }
  return false; // allowed
}
