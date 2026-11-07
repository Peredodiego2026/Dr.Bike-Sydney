// tests/unit/mechanic-bio-translations.test.js
//
// The mechanic's bio was English on every page in every language (5-nov). Now
// Admin translates it on save into escalation_contacts.bio_es / bio_zh, and the
// landing, the app and the tracking page pick the one for the visitor's
// language. These drive the real functions: the translator, the admin endpoint,
// the read that has to survive the migration not having been run yet, and the
// landing's pick.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN = 'peredo.dm@gmail.com';

// The admin endpoint's database, as a chain recorder. `row` is what the
// select('*') returns; `writeMatches` is whether the guarded update finds it.
const db = { row: null, writeMatches: true, writes: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: ADMIN } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      update: (payload) => {
        const w = { payload, filters: [] };
        db.writes.push(w);
        const chain = {
          eq: (c, v) => (w.filters.push(['eq', c, v]), chain),
          is: (c, v) => (w.filters.push(['is', c, v]), chain),
          select: async () => ({ data: db.writeMatches ? [{ id: 'mech-1' }] : [], error: null }),
        };
        return chain;
      },
    }),
  }),
}));

// verifyAdminSession asks GoTrue for TOTP factors; keep it off the network.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ factors: [] }) }))
);

const { handleAdminTranslateBio, fetchContactsWithBio } = await import('../../api/auth.js');
const { translateBio } = await import('../../api/_bio-translate.js');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}
const callAdmin = async (translate) => {
  const res = makeRes();
  await handleAdminTranslateBio({ body: { access_token: 'tok', contact_id: 'mech-1' } }, res, {
    translate,
  });
  return res;
};

beforeEach(() => {
  db.row = null;
  db.writeMatches = true;
  db.writes = [];
  process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
});

describe('translateBio (the call to the model)', () => {
  const answer = (body, status = 200) =>
    vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

  it('asks for exactly two strings and reads them back', async () => {
    const fetchImpl = answer({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"es":"Proactivo.","zh":"积极主动。"}' }],
    });
    const out = await translateBio('Proactive.', { fetchImpl, apiKey: 'k' });
    expect(out).toEqual({ es: 'Proactivo.', zh: '积极主动。' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('k');
    expect(init.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.fallbacks).toBe('default');
    expect(sent.output_config.format.schema.required).toEqual(['es', 'zh']);
    expect(sent.output_config.format.schema.additionalProperties).toBe(false);
    expect(sent.messages).toEqual([{ role: 'user', content: 'Proactive.' }]);
  });

  it('a refusal is an error, not an empty translation', async () => {
    const fetchImpl = answer({ stop_reason: 'refusal', content: [] });
    await expect(translateBio('x', { fetchImpl, apiKey: 'k' })).rejects.toThrow(/declined/);
  });

  it('an HTTP error carries the API message', async () => {
    const fetchImpl = answer({ error: { message: 'overloaded' } }, 529);
    await expect(translateBio('x', { fetchImpl, apiKey: 'k' })).rejects.toThrow(/529: overloaded/);
  });

  it('an empty string in the answer is refused', async () => {
    const fetchImpl = answer({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"es":"","zh":"x"}' }],
    });
    await expect(translateBio('x', { fetchImpl, apiKey: 'k' })).rejects.toThrow(/empty/);
  });

  it('without a key it fails before calling anything', async () => {
    const fetchImpl = vi.fn();
    await expect(translateBio('x', { fetchImpl, apiKey: '' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('admin-translate-bio (the endpoint)', () => {
  it('says the migration is missing instead of failing on an unknown column', async () => {
    db.row = { id: 'mech-1', bio: 'Proactive.' };
    const translate = vi.fn();
    const res = await callAdmin(translate);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('needs_migration');
    expect(translate).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });

  it('translates the SAVED bio and writes it only while that bio is unchanged', async () => {
    db.row = { id: 'mech-1', bio: 'Proactive.', bio_es: null, bio_zh: null };
    const translate = vi.fn(async () => ({ es: 'Proactivo.', zh: '积极主动。' }));
    const res = await callAdmin(translate);
    expect(translate).toHaveBeenCalledWith('Proactive.');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, bio_es: 'Proactivo.', bio_zh: '积极主动。' });
    expect(db.writes[0].payload).toEqual({ bio_es: 'Proactivo.', bio_zh: '积极主动。' });
    expect(db.writes[0].filters).toContainEqual(['eq', 'bio', 'Proactive.']);
  });

  it('a save that landed meanwhile wins: 409, the old translation is not kept', async () => {
    db.row = { id: 'mech-1', bio: 'Proactive.', bio_es: null, bio_zh: null };
    db.writeMatches = false;
    const res = await callAdmin(async () => ({ es: 'a', zh: 'b' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('bio_changed');
  });

  it('a failed translation writes nothing and says why', async () => {
    db.row = { id: 'mech-1', bio: 'Proactive.', bio_es: null, bio_zh: null };
    const res = await callAdmin(async () => {
      throw new Error('Anthropic HTTP 529: overloaded');
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/overloaded/);
    expect(db.writes).toHaveLength(0);
  });

  it('no bio: clears both translations without calling the model', async () => {
    db.row = { id: 'mech-1', bio: null, bio_es: 'viejo', bio_zh: '旧' };
    const translate = vi.fn();
    const res = await callAdmin(translate);
    expect(translate).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(db.writes[0].payload).toEqual({ bio_es: null, bio_zh: null });
    expect(db.writes[0].filters).toContainEqual(['is', 'bio', null]);
  });
});

describe('the public reads survive the migration not being run', () => {
  it('asks with bio_es/bio_zh, and on a 400 asks again without them', async () => {
    const urls = [];
    fetch.mockImplementation(async (url) => {
      urls.push(url);
      return {
        ok: !url.includes('bio_es'),
        status: url.includes('bio_es') ? 400 : 200,
        json: async () => [],
      };
    });
    const resp = await fetchContactsWithBio('id,bio', 'active=eq.true', {});
    expect(resp.status).toBe(200);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/select=id,bio,bio_es,bio_zh&active=eq\.true$/);
    expect(urls[1]).toMatch(/select=id,bio&active=eq\.true$/);
  });

  it('once migrated it is one read', async () => {
    const urls = [];
    fetch.mockImplementation(
      async (url) => (urls.push(url), { ok: true, status: 200, json: async () => [] })
    );
    await fetchContactsWithBio('id,bio', 'active=eq.true', {});
    expect(urls).toHaveLength(1);
  });
});

describe('the landing shows the bio for the page language', () => {
  const src = fs.readFileSync(path.resolve('js/landing-inline.js'), 'utf8');
  // \r?\n: on Diego's Windows checkout git hands the file over with CRLF.
  const body = src.match(/function mechBio\(m\) \{[\s\S]*?\r?\n {2}\}/)[0];
  const pick = (htmlLang, m) =>
    new Function('document', 'm', `${body}; return mechBio(m);`)(
      { documentElement: { lang: htmlLang } },
      m
    );
  const m = { bio: 'Proactive.', bio_es: 'Proactivo.', bio_zh: '积极主动。' };

  it('es and zh-CN get their translation, en-AU the English', () => {
    expect(pick('es', m)).toBe('Proactivo.');
    expect(pick('zh-CN', m)).toBe('积极主动。');
    expect(pick('en-AU', m)).toBe('Proactive.');
  });

  it('not translated yet: the English, never an empty card', () => {
    expect(pick('es', { bio: 'Proactive.', bio_es: null })).toBe('Proactive.');
  });
});

describe('Admin shows Diego what the other languages read', () => {
  const src = fs.readFileSync(path.resolve('js/admin.js'), 'utf8');
  const lift = (re) => src.match(re)[0];
  const esc = lift(/function esc\(str\) \{[\s\S]*?\r?\n\}/);
  const fn = lift(/function mechBioTranslationsHTML\(c\) \{[\s\S]*?\r?\n\}/);
  const html = (c) => new Function('c', `${esc}\n${fn}\nreturn mechBioTranslationsHTML(c);`)(c);

  it('before the migration it says nothing (no column, nothing to ask for)', () => {
    expect(html({ bio: 'Proactive.' })).toBe('');
  });

  it('a bio with no translation yet says how to get one', () => {
    expect(html({ bio: 'Proactive.', bio_es: null, bio_zh: null })).toMatch(/Not translated yet/);
  });

  it('shows both translations, escaped', () => {
    const out = html({ bio: 'x', bio_es: '<b>Proactivo</b>', bio_zh: '积极主动' });
    expect(out).toContain('&lt;b&gt;Proactivo&lt;/b&gt;');
    expect(out).toContain('积极主动');
    expect(out).not.toContain('<b>Proactivo');
  });
});
