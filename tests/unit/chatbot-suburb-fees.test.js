// tests/unit/chatbot-suburb-fees.test.js - asked "how much to Bondi?" on
// 5-nov-2026 the chatbot said $35 ($154 in total): it knew the fee bands but
// not how far Bondi is, and guessed from "Eastern Suburbs". Bondi Beach is 44
// minutes, $60. The prompt also listed Randwick as covered; it is 46 minutes,
// outside the same-day area. The bot now gets measured minutes, and the fee
// for each comes from the same function the booking charges with.
//
// With that list in the prompt (#590) it STILL said "Bondi Beach is $35 ...
// about 44 minutes" three times out of three, so the suburbs a customer names
// are now looked up in code and handed to the model as facts.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  formatSuburbFees,
  formatFeeBands,
  suburbFactsFor,
  MEASURED_MINUTES,
} from '../../api/chat.js';
import { FEE_BANDS, NORTH_NEAR_FEE, feeForMinutes } from '../../api/_coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const chat = readFileSync(join(root, 'api/chat.js'), 'utf8');
const lineFor = (block, name) => block.split('\n').find((l) => l.startsWith(`- ${name}:`));

describe('the chatbot quotes suburbs from measured driving time', () => {
  const block = formatSuburbFees();

  it('Bondi is $60, not the cheapest band', () => {
    expect(lineFor(block, 'Bondi Beach')).toBe('- Bondi Beach: 44 min - visit & diagnosis fee $60');
    expect(lineFor(block, 'Bondi Junction')).toMatch(/fee \$60$/);
  });

  it('Manly and Mosman are the first band', () => {
    expect(lineFor(block, 'Manly')).toMatch(new RegExp(`fee \\$${FEE_BANDS[0].fee}$`));
    expect(lineFor(block, 'Mosman')).toMatch(new RegExp(`fee \\$${FEE_BANDS[0].fee}$`));
  });

  it('Randwick and Marrickville are outside the same-day area, with no price', () => {
    expect(lineFor(block, 'Randwick')).toMatch(
      /outside the same-day area, by arrangement, no fixed price$/
    );
    expect(lineFor(block, 'Marrickville')).not.toMatch(/\$/);
  });

  it('every listed suburb gets exactly the fee the booking would charge', () => {
    for (const [name, minutes] of MEASURED_MINUTES) {
      const fee = feeForMinutes(minutes);
      const line = lineFor(block, name);
      if (fee === null) expect(line, name).toMatch(/outside the same-day area/);
      else expect(line, name).toMatch(new RegExp(`fee \\$${fee}$`));
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

describe('the suburbs a customer names are looked up, not left to the model', () => {
  it('the exact question that got $35', () => {
    expect(suburbFactsFor('How much is the visit fee to Bondi?')).toBe(
      '- Bondi Junction: 41 min - visit & diagnosis fee $60\n' +
        '- Bondi Beach: 44 min - visit & diagnosis fee $60'
    );
  });

  it('a specific Bondi means only that one', () => {
    expect(suburbFactsFor("I'm in Bondi Junction")).toBe(
      '- Bondi Junction: 41 min - visit & diagnosis fee $60'
    );
  });

  it('several suburbs, any case', () => {
    const facts = suburbFactsFor('newtown or MANLY, whichever is cheaper');
    expect(facts).toContain('- Manly: 10 min');
    expect(facts).toContain('- Newtown: 42 min');
  });

  it('an outside suburb gets no price', () => {
    expect(suburbFactsFor('Do you come to Randwick?')).toMatch(/^- Randwick: 46 min - outside/);
  });

  it('CBD and "the city" are the CBD', () => {
    expect(suburbFactsFor('how much in the CBD')).toMatch(/^- Sydney CBD: 32 min/);
    expect(suburbFactsFor('I work in the city')).toMatch(/^- Sydney CBD: 32 min/);
  });

  it('no suburb, no facts - and no false hit inside another word', () => {
    expect(suburbFactsFor('How much is a Tune-Up?')).toBe('');
    expect(suburbFactsFor('My bike is a Ryder')).toBe('');
  });

  it('the handler puts the facts in the prompt', () => {
    expect(chat).toContain('THE CUSTOMER HAS NAMED THESE SUBURBS');
    expect(chat).toContain('${suburbFacts}');
  });
});
