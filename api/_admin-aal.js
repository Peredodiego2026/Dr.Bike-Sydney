// api/_admin-aal.js - does an admin session actually carry the second factor?
//
// Audit finding 1 (2026-09-04), the critical one. verifyAdminSession() checked
// two things: that Supabase recognises the access token, and that the email is
// on ADMIN_ALLOWED_EMAILS. Nothing looked at the assurance level - grep the
// repo for "aal" before this file and there are zero hits.
//
// That matters because api/auth.js hands the browser a REAL Supabase access
// token BEFORE the TOTP step:
//
//   handleAdmin, step 1   -> { mfa_required: true, temp_token: userToken }
//   handleAdmin, no factor -> { access_token: userToken, setup_mfa: true }
//
// `temp_token` is the token signInWithPassword returned. Whoever holds the
// password can read it out of the network tab, close the TOTP prompt, and use
// it on all thirteen admin-* routes. The second factor was a screen, not a
// gate.
//
// THE RULE IS CONDITIONAL, AND THAT IS THE WHOLE DESIGN
// ----------------------------------------------------
// "Reject AAL1" full stop would be an outage with no way back. There is ONE
// admin email in the entire system (ADMIN_ALLOWED_EMAILS = [ADMIN_TEST_EMAIL]),
// and js/admin.js completes the login on an AAL1 token in two places on
// purpose: when the admin has no TOTP enrolled yet (setup_mfa), and when
// enrolment fails ("don't lock the admin out"). An admin with no factor who is
// refused cannot even reach the enrolment screen - and the fix would be behind
// the door that just closed.
//
// So: demand AAL2 only from an account that HAS a verified factor. That is the
// only case where AAL1 is a bypass. Refusing the other case buys no security
// and costs the whole panel.
//
// FAIL OPEN, LOUDLY
// -----------------
// Two things this cannot assume: that this project's JWT carries an `aal`
// claim at all, and that the factor lookup came back. Both resolve to
// 'allow' with a named verdict, so a wrong assumption shows up in the logs
// instead of locking the only admin out of the business.

/**
 * Reads the claims out of an access token WITHOUT verifying it. Verification
 * already happened - the caller only reaches here after sb.auth.getUser()
 * accepted the token against Supabase. This just looks inside.
 * Returns {} for anything unreadable; never throws.
 */
export function readTokenClaims(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1];
    if (!payload) return {};
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const data = JSON.parse(json);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {object} input
 * @param {string|undefined} input.aal  the token's `aal` claim, if it has one
 * @param {boolean|null} input.hasVerifiedFactor
 *        true  - the account has a verified TOTP factor
 *        false - it has none, so it must be allowed through to enrol
 *        null  - could not be determined (lookup failed)
 * @param {boolean} [input.enforce]  false = observe only (the default)
 *
 * Returns { allow, verdict, wouldReject }. `wouldReject` is what the enforcing
 * version WOULD do, and is what the logs are read for; `allow` is what happens
 * now.
 */
export function adminAalVerdict({ aal, hasVerifiedFactor, enforce = false }) {
  const decide = (verdict, wouldReject) => ({
    verdict,
    wouldReject,
    allow: wouldReject ? !enforce : true,
  });

  // The claim is not there. Either this project's GoTrue does not emit it or
  // the token shape changed. Enforcing on an absent claim would reject every
  // admin request forever, so it does not.
  if (!aal) return decide('no-aal-claim', false);

  if (aal === 'aal2') return decide('aal2', false);

  // AAL1 from here down.
  if (hasVerifiedFactor === true) return decide('aal1-with-factor', true);
  if (hasVerifiedFactor === false) return decide('aal1-no-factor', false);
  return decide('aal1-factors-unknown', false);
}
