// tests/unit/chatbot-no-false-promises.test.js - the landing chatbot's prompt
// promised things nothing in the app does (found 5-nov-2026):
// - "Confirmed within 30 min": a booking stays 'pending' until the mechanic
//   accepts it; there is no timer and no auto-confirm.
// - "Type 'mechanic' and I'll connect you right away": the chat widget
//   (js/landing-inline.js) sends that word back to the AI like any other
//   message - nobody is ever connected.
// - "Card via Stripe after job completion": the visit & diagnosis fee is
//   charged at booking; only the service is paid when the job is done.
// - "Our mechanics": there is one.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const chat = readFileSync(join(root, 'api/chat.js'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

describe('the chatbot promises only what the app does', () => {
  it('no confirmation-time promise', () => {
    expect(chat).not.toMatch(/confirmed within/i);
  });

  it('no "type mechanic" handoff - the widget cannot transfer anyone', () => {
    expect(chat).not.toMatch(/type ['"]mechanic['"]/i);
    expect(chat).toContain('0433 963 250');
  });

  it('payment: visit fee at booking, service when done', () => {
    expect(chat).not.toMatch(/after job completion/i);
    expect(chat).toContain('The visit & diagnosis fee is charged when booking online');
  });

  it('one mechanic, not a team of them', () => {
    expect(chat).not.toMatch(/our mechanics/i);
  });
});
