// tests/unit/chatbot-quotes-real-fees.test.js
//
// Diego asked whether the chatbot could answer with wrong information. It
// could, and it was: the assistant's system prompt still advertised the
// three-band visit fee
//
//     Up to 20 minutes (Northern Beaches): $25
//     20 to 32 minutes (North Shore, Hornsby): $35
//     32 to 45 minutes (CBD, Inner West, Eastern Suburbs): $45
//
// months after api/_coverage.js collapsed to two bands ($25 / $45) and moved
// $35 to the far peninsula only. tests/unit/coverage-resolution.test.js has
// asserted "$35 is not a time band any more" that whole time - against the
// charging code, which was right. Nobody checked the chatbot.
//
// So a Chatswood, Hornsby, North Sydney or Lane Cove customer was told $35 and
// charged $45; a Palm Beach or Avalon customer was told $45 and charged $35.
//
// Prices in this repo drift in exactly this way: one surface gets updated and
// the copies nobody remembered keep quoting the old number (CLAUDE.md, "Full
// coverage on every content/copy change"). The fix is not to correct the text,
// it is to stop it being text: api/chat.js now builds the block from
// FEE_BANDS. This pins that, so the day someone edits a band the assistant
// cannot be left behind.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { formatFeeBands } from '../../api/chat.js';
import { FEE_BANDS, PENINSULA_FAR_FEE, PERIMETER_MAX_MINUTES } from '../../api/_coverage.js';

const chatSrc = fs.readFileSync(new URL('../../api/chat.js', import.meta.url), 'utf8');

describe('the chatbot quotes fees the booking can actually charge', () => {
  it('names every fee the charging code allows', () => {
    const block = formatFeeBands();
    for (const band of FEE_BANDS) {
      expect(block, `the assistant never mentions the $${band.fee} band`).toContain(`$${band.fee}`);
    }
    expect(block, 'the peninsula cap is missing').toContain(`$${PENINSULA_FAR_FEE}`);
  });

  it('quotes no fee the booking would refuse', () => {
    const allowed = new Set([...FEE_BANDS.map((b) => b.fee), PENINSULA_FAR_FEE].map(String));
    const quoted = [...formatFeeBands().matchAll(/\$(\d+)/g)].map((m) => m[1]);
    expect(quoted.length).toBeGreaterThan(0);
    for (const fee of quoted) {
      expect(allowed.has(fee), `the assistant quotes $${fee}, which is not a real fee`).toBe(true);
    }
  });

  it("uses each band's real minute boundary", () => {
    const block = formatFeeBands();
    for (const band of FEE_BANDS) {
      expect(block).toContain(`${band.maxMinutes} minutes`);
    }
  });

  // The specific ghost. $35 as a TIME band is what sent Chatswood the wrong
  // number; $35 as the peninsula cap is correct and must stay.
  it('does not resurrect $35 as a middle time band', () => {
    const timeBands = FEE_BANDS.map((b) => b.fee);
    expect(timeBands).not.toContain(35);
    expect(formatFeeBands()).not.toMatch(/\$35\b(?![^\n]*(?:Palm Beach|flat))/);
  });

  // Derived, not retyped: no fee or perimeter written by hand in the prompt.
  it('the prompt interpolates the constants instead of hardcoding them', () => {
    expect(chatSrc).toContain('${formatFeeBands()}');
    expect(chatSrc).toContain('${PERIMETER_MAX_MINUTES} MINUTES');
    // The old ladder, gone for good.
    expect(chatSrc).not.toContain('20 to 32 minutes');
    expect(chatSrc).not.toContain('32 to 45 minutes');
  });
});

describe('the chatbot reads live data rather than a copy', () => {
  // Service prices come from Supabase on every request, which is why they have
  // never drifted the way the visit fee did.
  it('prices come from the services table', () => {
    expect(chatSrc).toMatch(/from\('services'\)/);
  });

  it('the perimeter it quotes is the one the code enforces', () => {
    expect(PERIMETER_MAX_MINUTES).toBe(45);
  });
});
