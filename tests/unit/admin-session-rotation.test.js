// tests/unit/admin-session-rotation.test.js — Supabase rotates the refresh
// token on every refresh, and js/admin.js runs with persistSession:false, so
// localStorage is the app's own responsibility. Two failures came out of that:
//
//   1. the pair written at login was the only pair ever stored, so within the
//      hour localStorage held a refresh token Supabase had already retired and
//      the next boot dropped Diego back to the login form;
//   2. when a refresh finally failed with the panel open, nothing put the login
//      form back - the whole dashboard stayed on screen while every feature
//      answered "Admin session expired - sign in again" (Diego's screenshot of
//      Orphan Payments, 11-Aug 2026).
//
// js/admin.js is a classic script (admin.html loads it with a plain <script
// src>), so it cannot be imported. These tests lift the pieces that decide out
// of the source and run them against stubs - the same read-the-source approach
// as tests/unit/mechanic-outbox-completion.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[1] || m[0];
};

const storeSrc = grab(/function storeAdminSession\(session\) \{[\s\S]*?\n\}/, 'storeAdminSession');
const clearSrc = grab(/function clearAdminSession\(\) \{[\s\S]*?\n\}/, 'clearAdminSession');
const restoreSrc = grab(
  /async function restoreAdminSession\(\) \{[\s\S]*?\n\}/,
  'restoreAdminSession'
);
const listenerSrc = grab(
  /sb\.auth\.onAuthStateChange\((\(event, session\) => \{[\s\S]*?\n\})\);/,
  'the onAuthStateChange listener'
);

const TOKEN = 'drbike-admin-token';
const REFRESH = 'drbike-admin-refresh';

function fakeStorage(initial = {}) {
  const map = { ...initial };
  return {
    map,
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

// Builds a live restoreAdminSession() over a stubbed supabase client.
function makeRestore({ stored, setSession }) {
  const localStorage = fakeStorage(stored);
  const warnings = [];
  const factory = new Function(
    'deps',
    `
    const { localStorage, console, sb } = deps;
    ${storeSrc}
    ${clearSrc}
    ${restoreSrc}
    return restoreAdminSession;
  `
  );
  const fn = factory({
    localStorage,
    console: { warn: (...a) => warnings.push(a.join(' ')) },
    sb: { auth: { setSession } },
  });
  return { fn, localStorage, warnings };
}

// Builds the live onAuthStateChange callback over stubbed globals.
function makeListener({ stored, overlayPresent = false }) {
  const localStorage = fakeStorage(stored);
  const calls = [];
  const factory = new Function(
    'deps',
    `
    const { localStorage, document, checkAdminAuth } = deps;
    ${storeSrc}
    ${clearSrc}
    return ${listenerSrc};
  `
  );
  const fn = factory({
    localStorage,
    document: { getElementById: () => (overlayPresent ? {} : null) },
    checkAdminAuth: () => calls.push('checkAdminAuth'),
  });
  return { fn, localStorage, calls };
}

const live = (access, refresh) => ({ access_token: access, refresh_token: refresh });

describe('restoreAdminSession', () => {
  it('writes the rotated pair back, not the one it read', async () => {
    // setSession() refreshed: the stored refresh token is spent and Supabase
    // handed back a new one. Leaving the old pair in place is what made the
    // NEXT boot fail.
    const { fn, localStorage } = makeRestore({
      stored: { [TOKEN]: 'old-access', [REFRESH]: 'old-refresh' },
      setSession: async () => ({ data: { session: live('new-access', 'new-refresh') } }),
    });

    await expect(fn()).resolves.toBe(true);
    expect(localStorage.getItem(TOKEN)).toBe('new-access');
    expect(localStorage.getItem(REFRESH)).toBe('new-refresh');
  });

  it('clears both keys when the stored pair is rejected', async () => {
    const { fn, localStorage, warnings } = makeRestore({
      stored: { [TOKEN]: 'dead', [REFRESH]: 'dead' },
      setSession: async () => ({ data: { session: null }, error: { message: 'Invalid Refresh Token' } }),
    });

    await expect(fn()).resolves.toBe(false);
    expect(localStorage.getItem(TOKEN)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
    // No silent errors: the reason has to reach the console.
    expect(warnings.join(' ')).toMatch(/Invalid Refresh Token/);
  });

  it('does not reject when setSession throws', async () => {
    // setSession can throw instead of returning {error} on a network failure.
    // An unhandled rejection here would leave the boot half-done.
    const { fn, localStorage } = makeRestore({
      stored: { [TOKEN]: 'a', [REFRESH]: 'b' },
      setSession: async () => {
        throw new Error('NetworkError');
      },
    });

    await expect(fn()).resolves.toBe(false);
    expect(localStorage.getItem(TOKEN)).toBeNull();
  });

  it('returns false without calling Supabase when nothing is stored', async () => {
    let called = false;
    const { fn } = makeRestore({
      stored: {},
      setSession: async () => {
        called = true;
        return { data: { session: live('a', 'b') } };
      },
    });

    await expect(fn()).resolves.toBe(false);
    expect(called).toBe(false);
  });
});

describe('the onAuthStateChange listener', () => {
  it('stores every rotation', () => {
    const { fn, localStorage } = makeListener({ stored: { [TOKEN]: 'old', [REFRESH]: 'old' } });
    fn('TOKEN_REFRESHED', live('rotated-access', 'rotated-refresh'));
    expect(localStorage.getItem(TOKEN)).toBe('rotated-access');
    expect(localStorage.getItem(REFRESH)).toBe('rotated-refresh');
  });

  it('ignores INITIAL_SESSION with no session - that is boot, not a sign-out', () => {
    // This fires before restoreAdminSession() has run. Treating it as a
    // sign-out would throw the login card over a panel that is about to work.
    const { fn, localStorage, calls } = makeListener({
      stored: { [TOKEN]: 'good', [REFRESH]: 'good' },
    });
    fn('INITIAL_SESSION', null);
    expect(localStorage.getItem(TOKEN)).toBe('good');
    expect(calls).toEqual([]);
  });

  it('puts the login form back when a refresh finally fails', () => {
    const { fn, localStorage, calls } = makeListener({
      stored: { [TOKEN]: 'stale', [REFRESH]: 'stale' },
    });
    fn('SIGNED_OUT', null);
    expect(localStorage.getItem(TOKEN)).toBeNull();
    expect(localStorage.getItem(REFRESH)).toBeNull();
    expect(calls).toEqual(['checkAdminAuth']);
  });

  it('asks for the login form on every SIGNED_OUT - checkAdminAuth is the guard', () => {
    const { fn, calls } = makeListener({ stored: {}, overlayPresent: true });
    fn('SIGNED_OUT', null);
    expect(calls).toEqual(['checkAdminAuth']);
  });
});

// A failed boot calls checkAdminAuth() twice in the same tick: once from the
// listener (setSession rejecting the stored pair emits SIGNED_OUT) and once
// from initAdmin() after restoreAdminSession() returns false. The second
// overlay is the one the admin sees - same z-index, later in the DOM - while
// getElementById() keeps handing the submit handler the first, empty pair, so
// signing in answers "Missing credentials" whatever is typed.
describe('checkAdminAuth', () => {
  const authSrc = grab(/function checkAdminAuth\(\) \{[\s\S]*?\n\}/, 'checkAdminAuth');

  function makeAuth(stored) {
    const localStorage = fakeStorage(stored);
    const body = [];
    const document = {
      createElement: () => ({ style: {}, set id(v) { this._id = v; }, get id() { return this._id; } }),
      getElementById: (id) => body.find((el) => el._id === id) || null,
      body: { appendChild: (el) => body.push(el) },
    };
    const factory = new Function(
      'deps',
      `const { localStorage, document, setTimeout } = deps; ${authSrc} return checkAdminAuth;`
    );
    return { fn: factory({ localStorage, document, setTimeout: () => {} }), body };
  }

  it('builds exactly one overlay however many times it is called', () => {
    const { fn, body } = makeAuth({});
    expect(fn()).toBe(false);
    expect(fn()).toBe(false);
    expect(fn()).toBe(false);
    expect(body.filter((el) => el._id === 'admin-login-overlay')).toHaveLength(1);
  });

  it('builds none at all while a token is stored', () => {
    const { fn, body } = makeAuth({ [TOKEN]: 'live' });
    expect(fn()).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe('storeAdminSession', () => {
  it('refuses a half pair rather than storing a token without its refresh', () => {
    const localStorage = fakeStorage();
    const factory = new Function('deps', `const { localStorage } = deps; ${storeSrc} return storeAdminSession;`);
    const store = factory({ localStorage });

    expect(store({ access_token: 'a' })).toBe(false);
    expect(store({ refresh_token: 'b' })).toBe(false);
    expect(store(null)).toBe(false);
    expect(localStorage.map).toEqual({});
    expect(store(live('a', 'b'))).toBe(true);
    expect(localStorage.map).toEqual({ [TOKEN]: 'a', [REFRESH]: 'b' });
  });
});
