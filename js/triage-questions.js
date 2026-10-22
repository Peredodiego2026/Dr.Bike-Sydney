// js/triage-questions.js - the booking triage: which questions to ask for which
// service. Data only: no DOM, no network, no side effects.
//
// Spec: docs/superpowers/specs/2026-10-22-triage-reserva-design.md. The point
// of every question is one thing: so the mechanic knows whether he has the
// right part BEFORE he drives out.
//
// HOW A SERVICE FINDS ITS QUESTIONS (questionsFor), in this order:
//   1. SERVICE_OVERRIDES[service.name]  - one of the 19 exceptions (or Emergency)
//   2. CATEGORY_SETS[service.category]  - the 9 base sets
//   3. DEFAULT_SET                      - a category this file has never heard of
// The questions hang off the CATEGORY, not the service, on purpose: a service
// Diego adds in Admin inherits its family's questions the same day instead of
// entering the wizard with none, in silence.
//
// WHY THE QUESTIONS LIVE HERE AND NOT IN THE DATABASE: every question is
// customer-visible copy, and this repo blocks the merge when copy is missing
// from es or zh. A question typed into Admin would ship in one language.
//
// RULES FOR EDITING THIS FILE
//   - `ask`, `hint` and every option are plain English string LITERALS. Never
//     build one by concatenation or interpolation.
//   - scripts/i18n-check.mjs does NOT read this file, so a missing translation
//     is not caught there. tests/unit/triage-questions.test.js is the guard: it
//     fails if any string below has no entry in js/i18n-es.js and js/i18n-zh.js.
//     The one exception is a brand name (Shimano, Bosch...): it reads the same
//     in every language, has no dictionary entry, and is named in that test.
//     After editing js/i18n-*.js, bump CACHE_STATIC in sw.js.
//   - A closed question ends with 'I am not sure'. A customer who admits they
//     do not know gives the mechanic information; one who guesses wrong makes
//     him load the wrong part.
//   - One id means one question, everywhere. The id is the key in the saved
//     `triage` jsonb and labelFor(id) is how Admin turns it back into words, so
//     two meanings under one id would be unreadable in Admin. That is why the
//     brake brand is `brand` but the hub, frame, motor and suspension brands
//     have ids of their own.
//   - `optional: true` marks a question the customer can skip without it
//     mattering. The ones that decide the part carry no flag. Neither blocks
//     Continue: the triage never gates the booking.

// Every question, defined once. Sets and overrides below only point at these
// by id, so the ids cannot drift apart from the questions.
const QUESTIONS = [
  // --- Shared ---------------------------------------------------------------
  {
    id: 'bike_type',
    ask: 'What type of bike is it?',
    options: [
      'Road',
      'Mountain',
      'Gravel',
      'Hybrid or commuter',
      'Kids',
      'E-Bike',
      'I am not sure',
    ],
  },
  {
    id: 'notes',
    ask: 'Anything else we should know?',
    hint: 'A few words is enough.',
    free: true,
    optional: true,
  },
  {
    id: 'symptom',
    ask: 'What is going wrong?',
    hint: 'When does it happen, and what do you hear or feel?',
    free: true,
    optional: true,
  },
  {
    id: 'own_part',
    ask: 'Are you supplying the part yourself?',
    options: ['Yes, I have it', 'No, please bring one', 'I am not sure'],
  },

  // --- Brakes: the brand decides the pad, the fluid and the bleed kit --------
  {
    id: 'brand',
    ask: 'What brand are the brakes?',
    hint: 'It is printed on the lever or the brake. It decides which pads, fluid and bleed kit we bring.',
    options: ['Shimano', 'SRAM', 'Magura', 'Hope', 'Tektro', 'Other', 'I am not sure'],
  },
  {
    id: 'brake_model',
    ask: 'Which model are they?',
    hint: 'For example SRAM Code or Shimano SLX.',
    free: true,
    optional: true,
  },
  {
    id: 'brake_type',
    ask: 'How do the brakes work?',
    hint: 'Hydraulic brakes have a fluid-filled hose. Cable brakes have a thin steel wire.',
    options: ['Hydraulic', 'Cable', 'I am not sure'],
  },
  {
    id: 'pad_material',
    ask: 'Resin or metallic pads?',
    hint: 'Resin is quieter. Metallic lasts longer. Skip this if you do not know.',
    options: ['Resin', 'Metallic', 'I am not sure'],
    optional: true,
  },
  {
    id: 'current_brakes',
    ask: 'What brakes does the bike have today?',
    options: ['Disc brakes', 'Rim brakes', 'I am not sure'],
  },

  // --- Wheels & tyres: diameter AND width. A 29 x 2.1 and a 29 x 2.6 are two
  // different tyres. ----------------------------------------------------------
  {
    id: 'tyre_size',
    ask: 'What size is the tyre?',
    hint: 'Printed on the side of the tyre, for example 29 x 2.1 or 700 x 28c.',
    free: true,
  },
  {
    id: 'tyre_system',
    ask: 'Does the tyre use a tube or run tubeless?',
    options: ['Tube', 'Tubeless', 'I am not sure'],
  },
  {
    id: 'own_tyre',
    ask: 'Are you bringing the tyre yourself?',
    options: ['Yes, I have it', 'No, please bring one', 'I am not sure'],
  },
  {
    id: 'broken_spokes',
    ask: 'How many spokes are broken?',
    options: ['One spoke', 'Two spokes', 'Three or more', 'I am not sure'],
  },
  {
    id: 'hub_brand',
    ask: 'What brand is the hub?',
    hint: 'The hub is the centre of the wheel. The name is usually printed on its body.',
    options: ['Shimano', 'DT Swiss', 'Hope', 'Novatec', 'Other', 'I am not sure'],
  },
  {
    id: 'has_broken_spokes',
    ask: 'Are any spokes broken?',
    hint: 'If a spoke is broken, the right service is Spoke Replacement.',
    options: ['No, none are broken', 'Yes, at least one', 'I am not sure'],
  },

  // --- Drivetrain: the speeds. An 11-speed chain does not fit a 12. ----------
  {
    id: 'speeds',
    ask: 'How many speeds does the bike have?',
    hint: 'Count the sprockets on the rear wheel.',
    options: [
      'Single speed',
      '7 speeds or fewer',
      '8 speeds',
      '9 speeds',
      '10 speeds',
      '11 speeds',
      '12 speeds',
      '13 speeds',
      'I am not sure',
    ],
  },
  {
    id: 'frame_brand',
    ask: 'What brand is the frame?',
    hint: 'Every frame has its own derailleur hanger. Add the model too if you know it.',
    free: true,
  },
  {
    id: 'bb_type',
    ask: 'Is the bottom bracket threaded or press-fit?',
    hint: 'The bottom bracket is where the cranks meet the frame.',
    options: ['Threaded', 'Press-fit', 'I am not sure'],
  },

  // --- Gears & cables: cable or electronic ----------------------------------
  {
    id: 'shifting_type',
    ask: 'How do the gears shift?',
    hint: 'Electronic systems have a battery and no gear cables, for example Shimano Di2 or SRAM AXS.',
    options: ['Cable', 'Electronic', 'I am not sure'],
  },
  {
    id: 'derailleur_position',
    ask: 'Front or rear derailleur?',
    options: ['Rear', 'Front', 'Both', 'I am not sure'],
  },
  {
    id: 'cable_kind',
    ask: 'Which cables need replacing?',
    options: ['Brake cables', 'Gear cables', 'Both', 'I am not sure'],
  },

  // --- Electronic & e-bike: the motor brand, where "we cannot" is likeliest --
  {
    id: 'motor_brand',
    ask: 'Who makes the motor?',
    hint: 'The logo is on the motor, near the pedals.',
    options: [
      'Bosch',
      'Shimano',
      'Yamaha',
      'Brose or Specialized',
      'Bafang',
      'Other',
      'I am not sure',
    ],
  },
  {
    id: 'brand_app',
    ask: 'Do you have the motor app on your phone?',
    hint: 'For example Bosch eBike Flow or Shimano E-TUBE Project.',
    options: ['Yes, it is installed', 'No, I do not have it', 'I am not sure'],
  },

  // --- Suspension: brand, model and year. The seals are specific. -------------
  {
    id: 'suspension_brand',
    ask: 'What brand is the suspension?',
    hint: 'The name is printed on the fork leg or the shock body.',
    options: ['RockShox', 'Fox', 'Marzocchi', 'SR Suntour', 'Other', 'I am not sure'],
  },
  {
    id: 'suspension_model',
    ask: 'Which model is it?',
    hint: 'For example Fox 34 or RockShox Pike.',
    free: true,
  },
  {
    id: 'suspension_year',
    ask: 'What year is it?',
    hint: 'Roughly is fine. It is often on a sticker on the fork leg.',
    free: true,
    optional: true,
  },
  {
    id: 'suspension_part',
    ask: 'Is it the fork or the rear shock?',
    options: ['Fork', 'Rear shock', 'I am not sure'],
  },

  // --- Cockpit & levers: almost nothing ---------------------------------------
  {
    id: 'bar_swap',
    ask: 'Are you fitting a new handlebar or refitting your current one?',
    options: ['A new one', 'My current one', 'I am not sure'],
  },
  {
    id: 'headset_feel',
    ask: 'What is the headset doing?',
    options: [
      'Feels loose or knocks',
      'Feels rough or notchy',
      'Just due for a service',
      'I am not sure',
    ],
  },
  {
    id: 'fit_goal',
    ask: 'What would you like to improve?',
    options: ['Comfort on the saddle', 'Knee or back pain', 'A general setup', 'I am not sure'],
  },

  // --- General & assembly -------------------------------------------------------
  {
    id: 'in_box',
    ask: 'Is the bike still in its box?',
    options: ['Yes, it is still boxed', 'No, it is out of the box', 'I am not sure'],
  },
  {
    id: 'parts_complete',
    ask: 'Are all the parts there?',
    options: ['Yes, everything is there', 'No, something is missing', 'I am not sure'],
  },
];

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

// Throws on an unknown id, so a typo in a set below fails the moment this
// module loads instead of putting `undefined` in front of a customer.
function pick(...ids) {
  return ids.map((id) => {
    const q = BY_ID.get(id);
    if (!q) throw new Error('triage-questions: unknown question id "' + id + '"');
    return q;
  });
}

// For tests and for the server (Task 3 only keeps keys on this list).
export const ALL_QUESTION_IDS = QUESTIONS.map((q) => q.id);

// What a category no set knows about gets: the bike, and a free line.
const DEFAULT_SET = pick('bike_type', 'notes');

// The 9 base sets, one per category in the services table (read 2026-10-22).
// Confirmed with Diego except Gears & cables, whose electronic-shifting
// branch the spec marks as unconfirmed.
export const CATEGORY_SETS = {
  Brakes: pick('brand', 'brake_model', 'brake_type'),
  'Wheels & tyres': pick('tyre_size', 'tyre_system'),
  Drivetrain: pick('speeds'),
  'Gears & cables': pick('shifting_type'), // unconfirmed with Diego
  'Electronic & e-bike': pick('motor_brand', 'symptom'),
  Suspension: pick('suspension_brand', 'suspension_model', 'suspension_year'),
  'Cockpit & levers': pick('bike_type'),
  // "Nothing, and that is fine": the one question is optional so Skip shows.
  'Scheduled services': pick('notes'),
  'General & assembly': pick('own_part'),
};

// The exceptions, by exact service name. Each takes the category's base set
// and returns the set this service asks. Source: the spec's "Las 19
// excepciones" (22-oct-2026), plus Emergency Service. Confirmed by Diego where
// noted; every other line is the spec's proposal. The handlebar, headset and
// saddle questions are the spec's "each with its own question" - the wording is
// a first draft, not something Diego has read.
//
// A name that no longer matches (Admin renamed the service) does not fail: the
// service falls back to its category's base set. The test that names every key
// against the catalogue is what catches it.
export const SERVICE_OVERRIDES = {
  // Brakes
  'Brake Pad Install': (base) => [...base, ...pick('pad_material')],
  // The brand stays required: it decides mineral oil or DOT. The type goes
  // because a bleed is hydraulic by definition.
  'Brake Bleed': (base) => base.filter((q) => q.id !== 'brake_type'),
  'Hydro Brake Install': (base) => [...base, ...pick('current_brakes')],

  // Wheels & tyres. The two Wheel Truing names carry the real em dash from the
  // services table; written as an escape so this file stays ASCII.
  'Spoke Replacement': () => pick('broken_spokes', 'hub_brand'),
  'Wheel Truing — Minor': () => pick('has_broken_spokes'),
  'Wheel Truing — Major': () => pick('has_broken_spokes'),
  // Tubeless already answers "tube or tubeless".
  'Tubeless Tyre Install': (base) => base.filter((q) => q.id !== 'tyre_system'),
  'Tyre / Tube Install': (base) => [...base, ...pick('own_tyre')],

  // Drivetrain
  // Asks about the FRAME, not the drivetrain: the hanger is specific to each
  // frame. Confirmed by Diego.
  'True Hanger Derailleur': () => pick('frame_brand'),
  'Bottom Bracket Install': () => pick('bb_type'), // unconfirmed with Diego

  // Gears & cables
  'Derailleur Install': (base) => [...base, ...pick('derailleur_position', 'own_part')],
  'External Cable Install': (base) => [...base, ...pick('cable_kind')],

  // Electronic & e-bike
  'Firmware Update': (base) => [...base, ...pick('brand_app')],
  // Maintenance, not a fault: there is no symptom to ask for.
  'E-bike service': (base) => base.filter((q) => q.id !== 'symptom'),

  // Suspension
  'Air Can Service': (base) => [...base, ...pick('suspension_part')],

  // Cockpit & levers. Bar Tape Install is NOT here, on purpose: it inherits the
  // category and asks no colour, because Diego stocks black only (LEBYCLE Wisp
  // 01A Black) and offering a choice promises one he cannot deliver.
  'Handlebar Install': (base) => [...base, ...pick('bar_swap')],
  'Headset Service': (base) => [...base, ...pick('headset_feel')],
  'Saddle Fitting': (base) => [...base, ...pick('fit_goal')],

  // General & assembly
  'Bike Assembly': () => pick('in_box', 'parts_complete'),

  // Not maintenance: someone stranded. app.js diverts it to a WhatsApp modal
  // before the wizard asks anything, so a question defined here would never be
  // seen. Keep it empty.
  'Emergency Service': () => [],
};

// Own-property lookups only: a category or service called "constructor" must
// not resolve to Object.prototype.constructor.
function own(table, key) {
  return Object.getOwnPropertyDescriptor(table, key)?.value;
}

// service: { name, category }. Always returns a NEW array (the question objects
// inside are shared, so treat them as read-only).
export function questionsFor(service) {
  const { name, category } = service || {};
  const base = own(CATEGORY_SETS, category) || DEFAULT_SET;
  const override = own(SERVICE_OVERRIDES, name);
  return override ? override([...base]) : [...base];
}

// The question text for a saved answer's id, or the id itself when this file
// does not know it (an old booking, or a question that was later removed).
export function labelFor(id) {
  return BY_ID.get(id)?.ask ?? id;
}
