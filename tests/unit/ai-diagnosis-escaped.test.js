// The "describe the problem" / photo diagnosis on the booking wizard shows
// what the AI answered (showDiagResult in js/app.js). That answer is the
// model's reply to text the client typed, so whatever the client talks it
// into saying is client input: until 2026-11-05 every field went into
// innerHTML raw, and a reply carrying `<img src=x onerror=...>` ran on the
// screen. Judged by the HTML the function really writes, not by the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const lift = (name) => {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} not found in js/app.js`);
  const fn = src.slice(at);
  return fn.slice(0, fn.indexOf('\n}') + 2);
};
const showDiagResult = new Function(
  `${lift('escapeHtml')}\n${lift('showDiagResult')}\nreturn showDiagResult;`
)();

// A screen with just the #diag-result box, which records what is written in.
const render = (data) => {
  const box = { innerHTML: '', querySelector: () => null };
  showDiagResult({ querySelector: (sel) => (sel === '#diag-result' ? box : null) }, data);
  return box.innerHTML;
};

const ATTACK = '<img src=x onerror=alert(1)>';

describe('the AI diagnosis is shown as text, never as markup', () => {
  it.each([
    ['diagnosis', { diagnosis: ATTACK }],
    ['details', { details: ATTACK }],
    ['urgency', { urgency: ATTACK }],
    ['severity', { severity: ATTACK }],
    ['service name on the Book button', { recommended_service_id: 1, recommended_service_name: ATTACK }],
    [
      'service price on the Book button',
      { recommended_service_id: 1, recommended_service_name: 'Tune-up', recommended_service_price: ATTACK },
    ],
  ])('%s', (_, data) => {
    const html = render(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('an ordinary answer still reads the same', () => {
    const html = render({
      diagnosis: 'Worn brake pads',
      severity: 'high',
      urgency: 'Urgent',
      details: "Rear pads at 1 mm - don't ride downhill",
      recommended_service_id: 7,
      recommended_service_name: 'Brake service',
      recommended_service_price: 45,
    });
    expect(html).toContain('Worn brake pads');
    expect(html).toContain('High severity');
    expect(html).toContain('Urgent');
    expect(html).toContain('Rear pads at 1 mm - don&#39;t ride downhill');
    expect(html).toContain('Book Brake service - $45 →');
  });
});
