// Text that comes out of the database is escaped before it goes into HTML.
// Two places in js/app.js interpolated it raw (found 2026-10-23, after the
// October audit had called XSS covered): the cancellation reason the admin
// types, shown to the client on their booking, and the bike name and brand on
// the booking wizard's bike chips. The same review found the service name
// raw on the booking detail and on the booking card (js/components.js).
// A reason like `<img src=x onerror=...>` ran in the client's browser.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const comp = readFileSync(new URL('../../js/components.js', import.meta.url), 'utf8');

describe('js/app.js escapes database text', () => {
  it.each([
    ['the cancellation reason', /\$\{booking\.cancellation_reason\}/],
    ['the bike name', /\$\{b\.name\}/],
    ['the bike brand', /' · ' \+ b\.brand\b/],
    ['the service name on the booking detail', /\$\{booking\.service_name \|\| 'Service'\}/],
  ])('%s is never interpolated raw', (_, raw) => {
    expect(src).not.toMatch(raw);
  });

  it('and is escaped where it is shown', () => {
    expect(src).toContain('${escapeHtml(booking.cancellation_reason)}');
    expect(src).toContain('${escapeHtml(b.name)}');
    expect(src).toContain("' · ' + escapeHtml(b.brand)");
    expect(src).toContain("${escapeHtml(booking.service_name || 'Service')}");
  });

  it('the booking card (js/components.js) escapes the service name too', () => {
    expect(comp).not.toMatch(/\$\{service_name \|\| 'Service'\}/);
    expect(comp).toContain("${escapeHtml(service_name || 'Service')}");
  });

  it('escapeHtml neutralises markup', () => {
    const fn = src.slice(src.indexOf('function escapeHtml('));
    const escapeHtml = new Function(`${fn.slice(0, fn.indexOf('\n}') + 2)}; return escapeHtml;`)();
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    expect(escapeHtml(null)).toBe('');
  });
});
