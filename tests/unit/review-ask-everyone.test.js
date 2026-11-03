// tests/unit/review-ask-everyone.test.js
//
// Until 3-nov-2026 the phone's review screen (renderReview in js/app.js)
// offered "Leave a Google Review" only after 5 stars. Google's review policy
// forbids selectively soliciting positive reviews, and a profile caught at it
// can lose its reviews - which are the main thing a local service has. The
// landing's review modal (js/landing-inline.js) already asked everyone.
//
// Checked in a real browser at 2, 4 and 5 stars when it changed; this pins the
// shape so the gate cannot quietly come back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('async function renderReview()');
const review = app.slice(start, app.indexOf('\nasync function ', start + 1));

describe('the review screen asks every rating for a Google review', () => {
  it('the Google button is not behind a star count', () => {
    expect(review).toContain('id="google-review-link"');
    const before = review.slice(0, review.indexOf('id="google-review-link"'));
    expect(before).not.toMatch(/if \(currentRating (===|>=|>) \d\)/);
  });

  it('a low rating gets the way to the 14-day guarantee, and no celebration', () => {
    expect(review).toContain('const low = currentRating <= 3;');
    expect(review).toMatch(/low\s*\?\s*`<p[^`]*14-day guarantee[^`]*<a href="\/claims\.html"/);
    expect(review).toMatch(/if \(low\) \{[\s\S]*?return;\s*\}\s*thankYou\(/);
  });
});
