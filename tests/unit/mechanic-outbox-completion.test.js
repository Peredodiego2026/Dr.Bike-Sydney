// tests/unit/mechanic-outbox-completion.test.js — the mechanic's outbox now
// carries completions, not just status taps (Diego, 2026-08-10: "si el mecanico
// no tiene senal al tocar Completar, hoy no pasa NADA"). A completion carries
// parts, a price and a card charge, so what the outbox does with one matters
// more than what it did with a status change.
//
// js/mechanic.js is a classic script (mechanic.html loads it with a plain
// <script src>), so it cannot be imported. These tests lift the two functions
// that decide out of the source and run them against stubs - the same
// read-the-source approach as tests/unit/get-availability-method.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/mechanic.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/mechanic.js`);
  return m[0];
};

const bodySrc = grab(
  /function outboxRequestBody\(item, token\) \{[\s\S]*?\n\}/,
  'outboxRequestBody'
);
const flushSrc = grab(/async function queueFlush\(\) \{[\s\S]*?\n\}/, 'queueFlush');

// Builds a live queueFlush over stubbed globals, with the queue passed in.
function makeFlush({ queue, responses }) {
  const toasts = [];
  const calls = [];
  const factory = new Function(
    'deps',
    `
    const { toast, queueSave, respond, calls, navigator, localStorage } = deps;
    let _flushing = false;
    let _queue = deps.queue;
    let mechanic = null;
    const load = () => {};
    const fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return respond();
    };
    ${bodySrc}
    ${flushSrc}
    return queueFlush;
  `
  );
  let i = 0;
  const respond = () => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.body || {} };
  };
  const queueFlush = factory({
    queue,
    toast: (m) => toasts.push(m),
    queueSave: async () => true,
    respond,
    calls,
    navigator: { onLine: true },
    localStorage: { getItem: () => JSON.stringify({ token: 'tok-123' }) },
  });
  return { queueFlush, queue, toasts, calls };
}

describe('outboxRequestBody', () => {
  const build = new Function(`${bodySrc}; return outboxRequestBody;`)();

  it('sends a completion as mechanic-complete, with the whole saved payload', () => {
    const body = { booking_id: 'b1', final_charge_amount: 120, tip_amount: 5 };
    expect(build({ type: 'complete', booking_id: 'b1', body }, 'tok')).toEqual({
      booking_id: 'b1',
      final_charge_amount: 120,
      tip_amount: 5,
      role: 'mechanic-complete',
      token: 'tok',
    });
  });

  it('adds the token at send time instead of storing it in the outbox', () => {
    // An item parked overnight must not carry an expired token, and the outbox
    // sits in localStorage/IndexedDB - not a place to keep a credential.
    const item = { type: 'complete', booking_id: 'b1', body: { booking_id: 'b1' } };
    expect(JSON.stringify(item)).not.toContain('token');
    expect(build(item, 'fresh-token').token).toBe('fresh-token');
  });

  it('still sends a status item as mechanic-update-status', () => {
    expect(build({ type: 'status', booking_id: 'b2', status: 'enroute' }, 'tok')).toEqual({
      role: 'mechanic-update-status',
      token: 'tok',
      booking_id: 'b2',
      status: 'enroute',
    });
  });

  it('treats an item with no type as a status change', () => {
    // Items written by the previous version of the app, still on a phone.
    expect(build({ booking_id: 'b3', status: 'arrived' }, 'tok').role).toBe(
      'mechanic-update-status'
    );
  });
});

describe('queueFlush with completions', () => {
  it('sends a parked completion and drops it once accepted', async () => {
    const { queueFlush, queue, calls } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: { booking_id: 'b1' } }],
      responses: [{ status: 200, body: { ok: true } }],
    });
    await queueFlush();
    expect(calls[0].role).toBe('mechanic-complete');
    expect(calls[0].token).toBe('tok-123');
    expect(queue).toHaveLength(0);
  });

  it('drops it on the server saying "already completed" instead of retrying forever', async () => {
    // api/_completion-guard.js answers 200 already_completed. The phone cannot
    // tell that from a normal success, which is the point.
    const { queueFlush, queue } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: {} }],
      responses: [{ status: 200, body: { ok: true, already_completed: true } }],
    });
    await queueFlush();
    expect(queue).toHaveLength(0);
  });

  it('keeps a completion whose card charge failed, flagged for the mechanic', async () => {
    // Nobody is looking at the screen when the outbox flushes. Dropping this
    // would lose the job AND the money.
    const { queueFlush, queue } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: {} }],
      responses: [{ status: 402, body: { code: 'AUTO_CHARGE_FAILED', error: 'Card declined' } }],
    });
    await queueFlush();
    expect(queue).toHaveLength(1);
    expect(queue[0].needs_payment).toBe(true);
    expect(queue[0].error).toBe('Card declined');
  });

  it('does not retry a parked completion on later flushes', async () => {
    const { queueFlush, calls } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: {}, needs_payment: true }],
      responses: [{ status: 200, body: {} }],
    });
    await queueFlush();
    expect(calls).toHaveLength(0);
  });

  it('keeps flushing the rest of the queue past a parked item', async () => {
    const { queueFlush, queue, calls } = makeFlush({
      queue: [
        { type: 'complete', booking_id: 'b1', body: {}, needs_payment: true },
        { type: 'status', booking_id: 'b2', status: 'enroute' },
      ],
      responses: [{ status: 200, body: {} }],
    });
    await queueFlush();
    expect(calls).toHaveLength(1);
    expect(calls[0].booking_id).toBe('b2');
    expect(queue).toHaveLength(1);
    expect(queue[0].booking_id).toBe('b1');
  });

  it('drops a completion for a job that was cancelled meanwhile', async () => {
    const { queueFlush, queue, toasts } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: {} }],
      responses: [
        { status: 409, body: { code: 'JOB_CANCELLED', error: 'This job was cancelled' } },
      ],
    });
    await queueFlush();
    expect(queue).toHaveLength(0);
    expect(toasts.join(' ')).toContain('cancelled');
  });

  it('leaves everything queued, in order, when there is still no signal', async () => {
    const { queueFlush, queue } = makeFlush({
      queue: [
        { type: 'complete', booking_id: 'b1', body: {} },
        { type: 'status', booking_id: 'b2', status: 'enroute' },
      ],
      responses: [new TypeError('Failed to fetch')],
    });
    await queueFlush();
    expect(queue.map((i) => i.booking_id)).toEqual(['b1', 'b2']);
  });

  it('leaves a completion queued when the server is having a moment (5xx)', async () => {
    const { queueFlush, queue } = makeFlush({
      queue: [{ type: 'complete', booking_id: 'b1', body: {} }],
      responses: [{ status: 500, body: {} }],
    });
    await queueFlush();
    expect(queue).toHaveLength(1);
    expect(queue[0].needs_payment).toBeUndefined();
  });
});

describe('submitComplete falls back to the outbox', () => {
  // \r?\n: this repo's files are checked out with CRLF endings.
  const fn = grab(/async function submitComplete\(id\) \{[\s\S]*?\r?\n\}\r?\n/, 'submitComplete');

  it('queues the completion when the fetch throws (no signal)', () => {
    expect(fn).toMatch(/catch\s*{[\s\S]*?queueAdd\(\{\s*type:\s*'complete'/);
  });

  it('closes the job on screen so the mechanic is not invited to tap twice', () => {
    const catchBlock = fn.slice(fn.indexOf('queueAdd({ type:'));
    expect(catchBlock).toMatch(/finishCompleteUI\(id\)/);
  });

  it('tells the mechanic when the phone could not even save it', () => {
    expect(fn).toMatch(/could not save it/);
  });

  it('clears any older completion for the job, on both paths', () => {
    // Without this, an item parked on a failed charge stays in the queue for
    // good - nothing else removes it, so the banner stays red forever and a
    // superseded price sits on the phone.
    const catchAt = fn.indexOf('queueAdd({ type:');
    const online = fn.slice(0, fn.indexOf('let resp')) + fn.slice(fn.indexOf('const okData'));
    expect(fn.slice(0, catchAt).lastIndexOf('queueDropCompletions(id)')).toBeGreaterThan(-1);
    expect(online).toMatch(/queueDropCompletions\(id\)/);
  });
});

describe('a parked completion can be cleared', () => {
  const dropSrc = grab(
    /async function queueDropCompletions\(bookingId\) \{[\s\S]*?\r?\n\}/,
    'queueDropCompletions'
  );
  const build = (queue) => {
    const saves = [];
    const factory = new Function(
      'deps',
      `
      let _queue = deps.queue;
      const queueSave = async () => { deps.saves.push(_queue.length); return true; };
      ${dropSrc}
      return { queueDropCompletions, read: () => _queue };
    `
    );
    return { ...factory({ queue, saves }), saves };
  };

  it('removes a parked completion so the red banner can clear', async () => {
    const { queueDropCompletions, read } = build([
      { type: 'complete', booking_id: 'b1', body: {}, needs_payment: true },
    ]);
    expect(await queueDropCompletions('b1')).toBe(1);
    expect(read()).toHaveLength(0);
  });

  it('leaves status changes and other jobs alone', async () => {
    const { queueDropCompletions, read } = build([
      { type: 'status', booking_id: 'b1', status: 'enroute' },
      { type: 'complete', booking_id: 'b2', body: {} },
      { type: 'complete', booking_id: 'b1', body: {} },
    ]);
    await queueDropCompletions('b1');
    expect(read().map((i) => i.type + ':' + i.booking_id)).toEqual(['status:b1', 'complete:b2']);
  });

  it('does not write to storage when there was nothing to drop', async () => {
    const { queueDropCompletions, saves } = build([{ type: 'status', booking_id: 'b1' }]);
    expect(await queueDropCompletions('b1')).toBe(0);
    expect(saves).toHaveLength(0);
  });
});
