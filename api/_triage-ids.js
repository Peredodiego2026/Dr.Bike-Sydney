// api/_triage-ids.js - the ids of the booking-triage questions the server will
// keep. A COPY of ALL_QUESTION_IDS in js/triage-questions.js, on purpose.
//
// WHY A COPY AND NOT AN IMPORT
//   api/auth.js is not just the booking endpoint: it is admin login, mechanic
//   login, coverage and every booking. If an import from js/ ever failed to
//   resolve in the Vercel bundle (an edit to .vercelignore, the file moved, a
//   change in how functions are traced) the whole file would stop loading and
//   take all of that down - a worse failure than the one the triage is built to
//   avoid, which is a booking losing its triage. api/ imports nothing from js/.
//
// WHY THE COPY CANNOT DRIFT
//   tests/unit/triage-ids-sync.test.js fails, and blocks the CI quality-gate,
//   the moment this list and the catalogue stop agreeing. Add a question to
//   js/triage-questions.js and that test names the id to paste here. Same
//   pattern as scripts/i18n-check.mjs: two lists, one control tying them.
//
// A question missing from this list is not a crash: the server drops its
// answer and the mechanic never sees it. That is exactly the silence the test
// exists to prevent.
export const TRIAGE_QUESTION_IDS = [
  'bike_type',
  'notes',
  'symptom',
  'own_part',
  'brand',
  'brake_model',
  'brake_type',
  'pad_material',
  'current_brakes',
  'tyre_size',
  'tyre_system',
  'own_tyre',
  'broken_spokes',
  'hub_brand',
  'has_broken_spokes',
  'speeds',
  'frame_brand',
  'bb_type',
  'shifting_type',
  'derailleur_position',
  'cable_kind',
  'motor_brand',
  'brand_app',
  'suspension_brand',
  'suspension_model',
  'suspension_year',
  'suspension_part',
  'bar_swap',
  'headset_feel',
  'fit_goal',
  'part_wanted',
  'in_box',
  'parts_complete',
];
