// tests/unit/admin-guests-and-collected.test.js
//
// Diego paid $30 as a guest and then said "no se activó nada en admin... no
// están los 30 aus ni el cliente en ni un lado".
//
// The booking WAS there and DID show $30. Two other things were missing, and
// they are different problems:
//
//   1. The person who paid did not exist as a client. Clients read `profiles`,
//      and a guest booking creates no profile - their details live on the
//      booking row.
//   2. The money was nowhere. Revenue counts completed jobs only, which is
//      correct accounting, but nothing showed cash already taken for work not
//      yet done.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const adminjs = read('js/admin.js');
const adminhtml = read('admin.html');

const loadClients = adminjs.slice(
  adminjs.indexOf('async function loadClients'),
  adminjs.indexOf('async function loadClients') + 6000
);

describe('a guest who paid is a client', () => {
  it('the screen reads bookings as well as profiles', () => {
    expect(loadClients).toMatch(/\.from\('bookings'\)/);
    expect(loadClients).toMatch(/\.is\('client_id', null\)/);
    expect(loadClients).toMatch(/\.not\('client_email', 'is', null\)/);
  });

  // Three bookings from one address is one customer, not three cards.
  it('one card per person, not per booking', () => {
    expect(loadClients).toMatch(/const byEmail = new Map\(\)/);
    expect(loadClients).toMatch(/seen\.bookings \+= 1;/);
  });

  it('and someone who later signs up is not duplicated', () => {
    expect(loadClients).toMatch(/const known = new Set/);
    expect(loadClients).toMatch(/!known\.has\(String\(g\.email\)\.trim\(\)\.toLowerCase\(\)\)/);
  });

  // The tile counted profiles only, so it said 1 while the list below showed 2.
  it('the total agrees with the list under it', () => {
    expect(adminjs).toMatch(/totalRes\.count \+ guestCount/);
  });

  it('a guest card is marked as one', () => {
    expect(adminjs).toMatch(/\$\{c\.isGuest \? 'Guest' : segLabel\}/);
    expect(adminjs).toMatch(/\$\{c\.isGuest \? 'First booked' : 'Joined'\}/);
  });

  // Bikes and Chat both take a profile id. A guest has none, so those buttons
  // would be dead - the phone number is the thing you actually need.
  it('and does not offer buttons that cannot work', () => {
    expect(adminjs).toMatch(/c\.isGuest\s*\r?\n?\s*\? `<div[^`]*c\.phone \|\| c\.email/s);
  });
});

describe('money taken for work not yet done is visible', () => {
  it('it is read separately, not folded into revenue', () => {
    expect(adminjs).toMatch(/\.not\('stripe_payment_intent_id', 'is', null\)/);
    expect(adminjs).toMatch(/\.not\('status', 'in', '\(completed,cancelled\)'\)/);
  });

  // Revenue recognition stays as it was: completed jobs only. This test exists
  // so a later change cannot quietly add held money to revenue and flatter it.
  it('revenue still counts completed jobs only', () => {
    const finance = adminjs.slice(adminjs.indexOf('async function loadFinance'));
    expect(finance).toMatch(/\.eq\('status', 'completed'\)/);
    expect(finance).not.toMatch(/const revenue = anRevenueOf\(jobs\) \+ held/);
  });

  it('the card exists in the panel', () => {
    expect(adminhtml).toMatch(/id="fk-held-card"/);
    expect(adminhtml).toMatch(/Collected, not yet earned/);
  });

  it('and hides itself when there is nothing held', () => {
    expect(adminjs).toMatch(/heldCard\.style\.display = held > 0 \? 'block' : 'none';/);
  });

  // A failed query must not read as "no money held".
  it('a read failure is logged, not swallowed', () => {
    expect(adminjs).toMatch(/console\.warn\('\[finance\] could not read collected-not-earned:'/);
  });
});
