// api/_security.js — Security middleware for all API endpoints
// Usage: import { guard, sanitize, rateLimit } from './_security.js';

// ── RATE LIMITING (in-memory, per Vercel function instance) ──────────────────
const rateLimitStore = new Map();

export function rateLimit(req, res, { max = 20, windowMs = 60000, key = null } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  const limitKey = key ? `${ip}:${key}` : ip;
  const now = Date.now();

  if (!rateLimitStore.has(limitKey)) {
    rateLimitStore.set(limitKey, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }

  const entry = rateLimitStore.get(limitKey);

  if (now > entry.resetAt) {
    rateLimitStore.set(limitKey, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;

  if (entry.count > max) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
    return true; // limited
  }

  return false;
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
  'https://dr-bike-sydney.vercel.app',
  'https://drbikesydney.com.au',
  'https://www.drbikesydney.com.au',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function setCORSHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://dr-bike-sydney.vercel.app');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ── GUARD — combined check: CORS + method + rate limit ───────────────────────
export function guard(req, res, opts = {}) {
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
  const limited = rateLimit(req, res, {
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

// ── VALIDATE PHONE (AU) ───────────────────────────────────────────────────────
export function isValidAUPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return (digits.startsWith('61') && digits.length === 11) ||
         (digits.startsWith('0') && digits.length === 10) ||
         digits.length === 9;
}

// ── STRIP SENSITIVE FIELDS from logs ─────────────────────────────────────────
export function safeLog(label, obj) {
  const safe = { ...obj };
  ['password', 'token', 'key', 'secret', 'auth', 'card', 'cvv', 'pan'].forEach(k => {
    Object.keys(safe).forEach(f => {
      if (f.toLowerCase().includes(k)) safe[f] = '[REDACTED]';
    });
  });
  console.log(label, JSON.stringify(safe));
}
