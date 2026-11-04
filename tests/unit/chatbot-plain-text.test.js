// tests/unit/chatbot-plain-text.test.js - the landing chat widget prints the
// bot's reply with textContent, so markdown shows as raw symbols. Seen live on
// 5-nov-2026: "call or WhatsApp **0433 963 250**". api/chat.js strips it.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { plainText } from '../../api/chat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('chatbot replies reach the client as plain text', () => {
  it('drops bold markers, keeps the words', () => {
    expect(plainText('To talk to him directly, call or WhatsApp **0433 963 250**. 🚲')).toBe(
      'To talk to him directly, call or WhatsApp 0433 963 250. 🚲'
    );
    expect(plainText('__Tune-Up__ is $119')).toBe('Tune-Up is $119');
  });

  it('drops heading marks at the start of a line', () => {
    expect(plainText('## Prices\nTune-Up $119')).toBe('Prices\nTune-Up $119');
  });

  it('leaves ordinary text alone', () => {
    const s = 'A $119 Tune-Up on a Sunday is $142.80 - 20% more. Book #2 is fine.';
    expect(plainText(s)).toBe(s);
  });

  it('the handler sends the reply through it', () => {
    const src = readFileSync(join(root, 'api/chat.js'), 'utf8');
    expect(src).toContain('json({ reply: plainText(reply) })');
  });

  it('the widget really does print raw text, which is why this exists', () => {
    const widget = readFileSync(join(root, 'js/landing-inline.js'), 'utf8');
    expect(widget).toContain('typing.textContent = data.reply');
  });
});
