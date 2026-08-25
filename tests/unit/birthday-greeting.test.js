// tests/unit/birthday-greeting.test.js
//
// The birthday campaign in api/send-cron.js was complete: scheduled daily,
// translated into three languages, greets by name, carries a discount code.
// It had never sent a single email and could not have - `profiles.birthday`
// was NULL for every row, because nothing in the app ever asked for it. The
// cron's own `.not('birthday','is',null)` matched nothing, every day, in
// silence.
//
// Found on 25-aug-2026, which was Diego's birthday, when he asked why he had
// not been greeted by his own app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const appjs = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const cronjs = fs.readFileSync(new URL('../../api/send-cron.js', import.meta.url), 'utf8');
const i18njs = fs.readFileSync(new URL('../../js/i18n.js', import.meta.url), 'utf8');

describe('the birthday can actually be entered', () => {
  it('the profile screen has a day and a month control', () => {
    expect(appjs).toMatch(/id="bday-day"/);
    expect(appjs).toMatch(/id="bday-month"/);
    expect(appjs).toMatch(/id="bday-save"/);
  });

  it('it is loaded from the profile so it survives a reload', () => {
    expect(appjs).toMatch(/stripe_default_payment_method_id, birthday'/);
    expect(appjs).toMatch(/birthday = profile\.birthday \|\| null/);
  });

  it('writes the column the cron reads', () => {
    expect(appjs).toMatch(/\.update\(\{ birthday: value \}\)/);
    expect(cronjs).toMatch(/\.not\('birthday', 'is', null\)/);
  });

  // The year is not asked for - it is personal data with no use here, since
  // the cron only ever compares month and day.
  it('does not ask for the year, and says so', () => {
    expect(appjs).toMatch(/We don't ask for the year/);
    // scoped to the birthday block: app.js has a native date input elsewhere
    const i = appjs.indexOf('Birthday</div>');
    const block = appjs.slice(i, i + 2000);
    expect(block).not.toMatch(/type="date"/);
    expect(block).toMatch(/id="bday-day"/);
  });

  // 1904 is not arbitrary. A non-leap sentinel would make 29 February
  // impossible to save, and those people have the worst birthday luck already.
  it('the sentinel year is a leap year, so 29 February can be stored', () => {
    const m = appjs.match(/const BIRTHDAY_SENTINEL_YEAR = (\d{4});/);
    expect(m).not.toBeNull();
    const y = Number(m[1]);
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    expect(isLeap).toBe(true);
  });

  // 31 April rolls over to 1 May silently in JavaScript. The check has to be
  // "build it and see what came back", not "day <= 31".
  it('rejects a day that does not exist in the chosen month', () => {
    expect(appjs).toMatch(/probe\.getMonth\(\) !== m - 1 \|\| probe\.getDate\(\) !== d/);
  });

  // The column is added by a hand-run migration, so "column does not exist"
  // is a real outcome and has to reach the person looking at the screen.
  it('a save failure shows the real error, never a silent catch', () => {
    expect(appjs).toMatch(/translateValue\('Could not save your birthday'\) \+ ': ' \+ error\.message/);
  });
});

describe('the app greets on the day', () => {
  it('the greeting is wired to the home route', () => {
    expect(appjs).toMatch(/if \(detail\.route === 'home'\) \{[\s\S]{0,80}showBirthdayGreeting\(\)/);
  });

  // localDateStr(d) needs a Date. Calling it bare throws, and because the
  // caller is not awaited the throw becomes an unhandled rejection - the
  // greeting just never appears and nothing is logged. That happened once
  // while building this.
  it('passes a Date to localDateStr instead of calling it bare', () => {
    expect(appjs).toMatch(/localDateStr\(new Date\(\)\)\.split\('-'\)/);
    const fn = appjs.slice(appjs.indexOf('function isBirthdayToday'));
    expect(fn.slice(0, 600)).not.toMatch(/localDateStr\(\)/);
  });

  // Sydney is UTC+10/11: toISOString would put every local morning on
  // yesterday's date.
  it('does not compute today through UTC', () => {
    const fn = appjs.slice(appjs.indexOf('function isBirthdayToday'), appjs.indexOf('const BIRTHDAY_SEEN_KEY'));
    expect(fn).not.toMatch(/toISOString/);
  });

  it('greets by name, and only once a year per device', () => {
    expect(appjs).toMatch(/'Happy birthday, NAME!'\)\.replace\('NAME', first\)/);
    expect(appjs).toMatch(/BIRTHDAY_SEEN_KEY/);
  });

  it('the name is escaped - it is user-controlled text', () => {
    expect(appjs).toMatch(/escapeHtml\(\s*translateValue\('Happy birthday, NAME!'\)/);
  });

  it('is translated into both other languages', () => {
    const es = i18njs.indexOf("'Happy birthday, NAME!'");
    const zh = i18njs.indexOf("'Happy birthday, NAME!'", es + 1);
    expect(es).toBeGreaterThan(-1);
    expect(zh).toBeGreaterThan(-1);
  });
});
