// tests/unit/referral-credits.test.js
//
// "no probamos el codigo de descuento del cliente que tiene en su perfil".
//
// It could not be tested, because it could not work. handleApplyReferral()
// credited both sides of a referral and NOTHING anywhere subtracted the number
// again - the only two writes to referral_credits in the whole repo were
// increments. A client could share their code, watch "Credits earned" reach $30
// in their profile, and find at the checkout that the money did not exist.
//
// On top of that the app promised $15 in three places and three languages while
// the server credited $10.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const auth = read('api/auth.js');
const appjs = read('js/app.js');
const sql = read('scripts/referral-credits-spendable.sql');

describe('the credit can be spent', () => {
  it('booking calls the spend function', () => {
    expect(auth).toMatch(/sb\.rpc\('spend_referral_credits', \{/);
    expect(auth).toMatch(/p_user: user\.id,/);
  });

  // Capped by what is LEFT after the promo code, not by the full price -
  // otherwise a $109 service with a $15 code could consume $109 of credit.
  it('and only against what a promo code left behind', () => {
    expect(auth).toMatch(/const remaining = Math\.max\(0, servicePrice - codeDiscount\);/);
    expect(auth).toMatch(/discount_applied: codeDiscount \+ spent,/);
  });

  // A guest has no profile, so no credits. `user` is null for them.
  it('a guest is skipped, not errored', () => {
    const block = auth.slice(auth.indexOf('// 6b. Referral credit'), auth.indexOf('// 6b.') + 3000);
    // `&& !holdOnly` joined this when slot holds landed. What this test is
    // about is the `user` term: a guest has no profile and therefore no
    // credits, so the whole block is skipped rather than throwing.
    expect(block).toMatch(/if \(user( && !holdOnly)? \) ?\{|if \(user( && !holdOnly)?\) \{/);
  });

  // Credits are spent when the booking is BOUGHT, never when the slot is merely
  // held. Without this, a client who held a slot and then walked away from the
  // payment screen would have had their credits spent on nothing.
  it('a hold never spends credits', () => {
    const block = auth.slice(auth.indexOf('// 6b. Referral credit'), auth.indexOf('// 6b.') + 3000);
    expect(block).toMatch(/if \(user && !holdOnly\)/);
  });

  // Losing a booking is far worse than a late discount.
  it('a failure never kills the booking', () => {
    expect(auth).toMatch(/console\.error\('\[create-booking\] referral credit spend failed:'/);
  });

  // The credit left the profile but never reached the booking: the client's
  // money would simply evaporate.
  it('and money taken but not applied is put back', () => {
    expect(auth).toMatch(/console\.error\('\[create-booking\] credit spent but not applied:'/);
    expect(auth).toMatch(/refund_referral_credits', \{ p_user: user\.id, p_amount: spent \}/);
  });
});

describe('the number the app promises is the number the server pays', () => {
  it('the server credits 15', () => {
    expect(auth).toMatch(/const CREDIT = 15;/);
  });

  it('which is what the profile screen says', () => {
    expect(appjs).toMatch(/You and your friend each get \$15 off/);
    expect(appjs).toMatch(/They get \$15 off their first service/);
  });
});

describe('a cancelled booking gives the credit back', () => {
  it('the cancel path restores it', () => {
    const cancel = auth.slice(auth.indexOf('async function handleClientCancel'));
    expect(cancel).toMatch(/refund_referral_credits/);
  });

  // Zeroing the column in the same breath is what stops a second cancel of the
  // same booking from minting credit out of nothing.
  it('exactly once', () => {
    expect(auth).toMatch(/\.update\(\{ referral_credit_applied: 0 \}\)/);
    expect(auth).toMatch(/\.gt\('referral_credit_applied', 0\)/);
  });
});

// scripts/*.sql are run BY HAND, so code reaches main before the migration
// does. Naming a new column in a SELECT would take the whole screen down until
// Diego ran the file - PostgREST rejects the request, it does not skip the
// column. This has bitten the project before (memory: "merged code is not a
// migrated DB").
describe('nothing breaks before the SQL is run', () => {
  it("the mechanic's job query does not name the new column", () => {
    const mechQuery = auth.match(/\?select=\$\{baseCols\}[^`]*/)?.[0] ?? '';
    expect(mechQuery).not.toMatch(/referral_credit_applied/);
  });

  it("nor does the cancel path's main read", () => {
    expect(auth).not.toMatch(/google_event_id,referral_credit_applied/);
  });

  it('the cancel path asks for it separately, and survives it missing', () => {
    const cancel = auth.slice(auth.indexOf('async function handleClientCancel'));
    expect(cancel).toMatch(/\.select\('referral_credit_applied'\)/);
    expect(cancel).toMatch(/\[client-cancel\] referral credit restore failed:/);
  });
});

describe('the client sees the credit before paying, not after', () => {
  it('the summary has a row for it', () => {
    expect(appjs).toMatch(/id="q-credit-row"/);
    expect(appjs).toMatch(/id="q-credit-amt"/);
  });

  it('capped the same way the server caps it', () => {
    expect(appjs).toMatch(
      /const creditUsed = \(\) => Math\.min\(_referralCredit, _currentServiceTotal\);/
    );
  });

  // Applying a code shrinks the service total, which shrinks the credit's ceiling.
  it('and recomputed when a promo code lands', () => {
    const apply = appjs.slice(appjs.indexOf('const applyDiscount ='));
    expect(apply.slice(0, 1200)).toMatch(/paintTotals\(\);/);
  });

  it('a failed balance read does not block the booking', () => {
    expect(appjs).toMatch(/\[summary\] could not read referral credit:/);
  });
});

describe('the migration', () => {
  // Two bookings in the same second must not both spend one balance. This is
  // the same race consume_discount_code() exists to stop for promo codes.
  it('locks the row before spending', () => {
    expect(sql).toMatch(/for update;/);
    expect(sql).toMatch(/v_spent := least\(v_balance, p_max\);/);
  });

  it('only the server may move the money', () => {
    expect(sql).toMatch(/revoke all on function public\.spend_referral_credits/);
    expect(sql).toMatch(
      /grant execute on function public\.spend_referral_credits\(uuid, numeric\) to service_role;/
    );
  });

  it('and it can be run twice', () => {
    expect(sql).toMatch(/add column if not exists referral_credit_applied/);
    expect(sql).toMatch(/create or replace function public\.spend_referral_credits/);
  });
});
