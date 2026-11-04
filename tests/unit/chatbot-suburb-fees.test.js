// tests/unit/chatbot-suburb-fees.test.js - asked "how much to Bondi?" on
// 5-nov-2026 the chatbot said $35 ($154 in total): it knew the fee bands but
// not how far Bondi is, and guessed from "Eastern Suburbs". Bondi Beach is 44
// minutes, $60. The prompt also listed Randwick as covered; it is 46 minutes,
// outside the same-day area. The bot now gets measured minutes, and the fee
// for each comes from the same function the booking charges with.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { formatSuburbFees, formatFeeBands, MEASURED_MINUTES } from '../../api/chat.js';
import { FEE_BANDS, NORTH_NEAR_FEE, feeForMinutes } from '../../api/_coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const chat = readFileSync(join(root, 'api/chat.js'), 'utf8');
const lineFor = (block, name) => block.split('\n').find((l) => l.includes(`${name} (`));

describe('the chatbot quotes suburbs from measured driving time', () => {
  const block = formatSuburbFees();

  it('Bondi is $60, not the cheapest band', () => {
    expect(lineFor(block, 'Bondi Beach')).toMatch(/^- \$60:/);
    expect(lineFor(block, 'Bondi Junction')).toMatch(/^- \$60:/);
  });

  it('Manly and Mosman are the first band', () => {
    expect(lineFor(block, 'Manly')).toMatch(new RegExp(`^- \\$${FEE_BANDS[0].fee}:`));
    expect(lineFor(block, 'Mosman')).toMatch(new RegExp(`^- \\$${FEE_BANDS[0].fee}:`));
  });

  it('Randwick and Marrickville are outside the same-day area, with no price', () => {
    expect(lineFor(block, 'Randwick')).toMatch(/^- Outside the same-day area:/);
    expect(lineFor(block, 'Marrickville')).toMatch(/^- Outside the same-day area:/);
  });

  it('every listed suburb gets exactly the fee the booking would charge', () => {
    for (const [name, minutes] of MEASURED_MINUTES) {
      const fee = feeForMinutes(minutes);
      const line = lineFor(block, name);
      if (fee == null) expect(line, name).toMatch(/^- Outside/);
      else expect(line, name).toMatch(new RegExp(`^- \\$${fee}:`));
    }
  });

  it('the north corridor flat fee is in the bands block', () => {
    expect(formatFeeBands()).toContain(
      `Terrey Hills, Duffys Forest, Cottage Point and Ingleside: $${NORTH_NEAR_FEE} flat`
    );
  });

  it('the prompt carries the list and no longer names Randwick as covered', () => {
    expect(chat).toContain('${formatSuburbFees()}');
    expect(chat).not.toContain('Eastern Suburbs (Bondi, Paddington, Randwick)');
  });
});
