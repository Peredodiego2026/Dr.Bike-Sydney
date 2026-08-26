// tests/unit/live-updates.test.js
//
// Diego, walking a real job across three screens: "la actualizacion al dia 31
// en mi pagina de admin y mechanic solo aparecieron cuando hice reset a las
// paginas" and "apreto boton en ruta pero en la seccion booking de la spa
// sigue el servicio en confirmed... actualice la pagina y ahora aparece".
//
// One symptom, three unrelated causes:
//   admin     - listened, updated memory, and never repainted the table.
//   SPA       - had no subscription to `bookings` at all.
//   mechanic  - was correct all along; its events were not arriving, which is
//               a database setting (scripts/enable-realtime-bookings.sql).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const admin = read('js/admin.js');
const app = read('js/app.js');
const mech = read('js/mechanic.js');
const sql = read('scripts/enable-realtime-bookings.sql');

describe('admin repaints, not just remembers', () => {
  it('the UPDATE handler repaints', () => {
    const sub = admin.slice(
      admin.indexOf('function subscribeToBookings'),
      admin.indexOf('function subscribeToBookings') + 2500
    );
    expect(sub).toMatch(/allBookings\[idx\] = \{ \.\.\.allBookings\[idx\], \.\.\.payload\.new \};/);
    expect(sub).toMatch(/repaintBookingsSoon\(\);/);
  });

  // A single completion writes the booking several times in a row, each its
  // own event. Without coalescing the table refetches three times in a second.
  it('coalesced, so one completion is one repaint', () => {
    expect(admin).toMatch(/clearTimeout\(_repaintTimer\);/);
    expect(admin).toMatch(/_repaintTimer = setTimeout\(/);
  });

  // Found while re-reading this: admin switches pages with an `active` CLASS,
  // so the first version's `page.style.display === 'none'` read '' forever and
  // refetched the table every minute while the admin was on another screen.
  it('and only while the bookings page is the one on screen', () => {
    expect(admin).toMatch(/if \(!page\?\.classList\.contains\('active'\)\) return;/);
    expect(admin).not.toMatch(/page\.style\.display === 'none'/);
  });

  // Repainting under an open modal loses the admin's place mid-read.
  it('and never under an open modal', () => {
    for (const id of ['booking-detail-modal', 'cancel-modal', 'reassign-modal']) {
      expect(admin, `does not guard ${id}`).toMatch(new RegExp(`'${id}'`));
    }
  });
});

describe('the client SPA finds out on its own', () => {
  it('it subscribes to bookings, which it never did before', () => {
    expect(app).toMatch(/table: 'bookings',/);
    expect(app).toMatch(/filter: `client_id=eq\.\$\{session\.user\.id\}`,/);
  });

  // This is the case Diego actually hit: he was switching between the mechanic
  // app and the client app.
  it('and refreshes when the tab comes back', () => {
    expect(app).toMatch(/document\.addEventListener\('visibilitychange', refreshBookingsIfIdle\)/);
  });

  it('with a poll behind it in case realtime is off', () => {
    expect(app).toMatch(/setInterval\(refreshBookingsIfIdle, 30000\)/);
  });

  // Redrawing the list under an open sheet yanks it away mid-sentence.
  it('never while a booking sheet is open', () => {
    expect(app).toMatch(/!document\.getElementById\('detail-panel'\)/);
  });

  // A channel per visit to the screen would pile up silently.
  it('and the subscription is torn down on the way out', () => {
    expect(app).toMatch(/else if \(detail\.prev === 'my-bookings'\) stopBookingsLive\(\);/);
    expect(app).toMatch(/sb\.removeChannel\(_bookingsLiveChannel\)/);
  });

  it('a guest, who has no rows, is skipped', () => {
    const live = app.slice(app.indexOf('async function startBookingsLive'));
    expect(live.slice(0, 900)).toMatch(/if \(!session\) return;/);
  });
});

describe('the mechanic no longer depends on a database setting', () => {
  // The mechanic is riding between jobs. "Pull to refresh to find out the job
  // moved" is not a workable instruction.
  it('it reloads when the phone returns to the app', () => {
    expect(mech).toMatch(/document\.addEventListener\('visibilitychange', onVisible\)/);
    expect(mech).toMatch(/setInterval\(\(\) => \{\s*if \(canReload\(\)\) load\(\);\s*\}, 60000\)/);
  });

  // Reloading mid-completion would wipe a signature the client already gave.
  it('but never with the completion modal open', () => {
    expect(mech).toMatch(/!document\.getElementById\('complete-modal'\)/);
  });

  it('and it cleans up after itself', () => {
    expect(mech).toMatch(/clearInterval\(reloadInterval\);/);
    expect(mech).toMatch(/document\.removeEventListener\('visibilitychange', onVisible\);/);
  });
});

describe('the migration that makes it instant', () => {
  it('adds the three watched tables to the publication', () => {
    expect(sql).toMatch(/array\['bookings', 'mechanic_locations', 'job_messages'\]/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.%I/);
  });

  // `alter publication ... add table` errors on a table that is already a
  // member, so running the file twice must not blow up.
  it('and can be run twice', () => {
    expect(sql).toMatch(/if not exists \(\s*select 1 from pg_publication_tables/);
  });

  // Realtime respects RLS. That is what stops one client's phone being told
  // about another client's booking, and it must stay true.
  it('the file says out loud that RLS still applies', () => {
    expect(sql).toMatch(/Realtime respects RLS/);
  });
});
