// api/_privacy.js — where a client's personal information actually lives.
//
// Audit point 9. privacy.html already promises, under the Privacy Act 1988:
//
//   "Access the personal information we hold about you"
//   "Request deletion of your personal information (subject to our legal
//    retention obligations)"
//   "...contact us at contact@drbikesydney.com.au. We will respond within 30 days."
//
// Answering by email within 30 days is a compliant process under Australian
// law - a self-service button is not required. The gap was not the button. The
// gap was that when somebody actually asked, there was NO WAY TO DO IT: Diego
// would have had to hand-write SQL across a dozen tables and know, from
// memory, which ones hold personal data. A promise you cannot execute is worse
// than no promise, because it is on the website.
//
// THE THING THAT MAKES THIS NOT A SIMPLE DELETE
//
// privacy.html also says booking and service records are kept SEVEN YEARS,
// "required for tax and financial compliance under Australian law". Those two
// promises look contradictory and are not: the answer is to ANONYMISE, not
// delete. The financial record survives with its dates and amounts - which is
// what the ATO requires - and every trace of who the person was is stripped
// out of it.
//
// So nothing here deletes a booking row. Ever. `bookings` is UPDATE-only, and
// there is a test that fails if a future edit adds it to the delete list.
//
// This file is the single source of truth. docs/RUNBOOK-PRIVACY.md is
// GENERATED from it by scripts/privacy-check.mjs, so the runbook Diego pastes
// into Supabase cannot drift away from what the code says.

// What replaces each value. Not blanked to NULL: a NULL is ambiguous ("was
// there never a name, or was it removed?"), and some of these columns are NOT
// NULL. A visible marker makes an anonymised record obviously anonymised.
export const REDACTED = '[removed at client request]';

/**
 * Every table that holds something identifying about a client.
 *
 *   match      - the column that ties a row to the person
 *   anonymise  - PII columns overwritten with REDACTED
 *   nullify    - PII columns set to NULL (coordinates, images, tokens: a
 *                marker string in them would be nonsense or break rendering)
 *   deletable  - whether the whole row may go. FALSE where a retention
 *                obligation applies.
 *   why        - stated per table, because "why is this row still here" is the
 *                question a privacy request has to be able to answer.
 */
export const PII_MAP = [
  {
    table: 'bookings',
    match: ['client_id', 'client_email'],
    anonymise: ['client_name', 'client_email', 'client_phone', 'address'],
    nullify: [
      'address_lat',
      'address_lng',
      'arrival_pin',
      'notes',
      'mechanic_notes',
      'client_signature_url',
      'photo_before_url',
      'photo_after_url',
      'client_review',
    ],
    deletable: false,
    why: 'Financial record. privacy.html commits to 7 years for tax compliance, so the row stays and only the identity is stripped.',
  },
  {
    table: 'profiles',
    match: ['id', 'email'],
    anonymise: ['full_name', 'email', 'phone'],
    nullify: ['avatar_url', 'birthday', 'push_subscription'],
    deletable: false,
    why: 'Deleting it would orphan the bookings that must be kept. Anonymised in place instead.',
  },
  {
    table: 'bikes',
    match: ['client_id'],
    anonymise: [],
    nullify: ['notes'],
    deletable: true,
    why: 'A bicycle is the client’s property, not a financial record. Nothing requires keeping it.',
  },
  {
    table: 'job_messages',
    match: ['booking_id'],
    anonymise: ['message'],
    nullify: [],
    deletable: true,
    why: 'Chat between client and mechanic. No retention obligation.',
  },
  {
    table: 'checkout_attempts',
    match: ['client_id'],
    anonymise: ['address'],
    nullify: [],
    deletable: true,
    why: 'An abandoned checkout. Nothing was charged, nothing to keep.',
  },
  {
    table: 'claims',
    match: ['client_email'],
    anonymise: ['client_name', 'client_email', 'phone', 'description'],
    nullify: ['photo_urls', 'resolution_notes'],
    deletable: false,
    why: 'A claim can become a dispute. Kept as a record, stripped of identity.',
  },
  {
    table: 'waitlist',
    match: ['client_id', 'client_email'],
    anonymise: ['client_name', 'client_email'],
    nullify: [],
    deletable: true,
    why: 'A request to be told about a slot. No obligation once withdrawn.',
  },
  {
    table: 'newsletter_subscribers',
    match: ['email'],
    anonymise: ['email'],
    nullify: [],
    deletable: true,
    why: 'Marketing consent. Withdrawing it is exactly this request.',
  },
  {
    table: 'notifications',
    match: ['user_id'],
    anonymise: [],
    nullify: ['body'],
    deletable: true,
    why: 'Delivered messages. Content can name the person and the address.',
  },
];

// Tables deliberately NOT touched, recorded so the omissions are a decision
// rather than something the next reader has to re-derive.
export const NOT_PERSONAL = {
  services: 'the price list',
  callout_zones: 'the coverage map',
  van_zones: 'the coverage map',
  availability: 'the calendar; holds no identity',
  parts_inventory: 'stock levels',
  van_inventory: 'stock levels',
  expenses: 'the business’s own costs, not a client’s data',
  escalation_contacts: 'staff, not clients - a mechanic leaving is a different process',
  stripe_events: 'Stripe’s own event ids, needed to stop a webhook being processed twice',
  discount_codes: 'campaign codes, not tied to a person',
  gift_cards: 'a payment instrument; the buyer is reachable through bookings',
  bike_service_history: 'reached through bikes; handled with it',
  geo_cache: 'geocoded addresses with no person attached',
  login_attempts: 'rate-limit state keyed on IP, expires in minutes',
  notification_log: 'delivery outcomes; no message body',
  mechanic_locations: 'the mechanic’s GPS, not the client’s',
};

/** Every column this file claims is personal, as `table.column`. */
export function allPiiColumns() {
  return PII_MAP.flatMap((t) => [...t.anonymise, ...t.nullify].map((c) => `${t.table}.${c}`));
}

/**
 * The SQL for one privacy request. Returns statements as strings so they can
 * be reviewed before anything runs - this is pasted into Supabase by a human,
 * on purpose. An endpoint that anonymises a client on an HTTP call is a
 * weapon; a reviewed script is a tool.
 */
export function anonymisationPlan({ clientId = null, email = null }) {
  if (!clientId && !email) throw new Error('need a client_id or an email');
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const out = [];

  for (const t of PII_MAP) {
    const conds = [];
    for (const m of t.match) {
      if (m.endsWith('email') && email) conds.push(`${m} = ${q(email)}`);
      else if (m === 'id' && clientId) conds.push(`${m} = ${q(clientId)}::uuid`);
      else if (m.endsWith('_id') && m !== 'booking_id' && clientId)
        conds.push(`${m} = ${q(clientId)}::uuid`);
    }
    // job_messages hangs off the booking, not off the person.
    if (t.table === 'job_messages') {
      const inner = clientId ? `client_id = ${q(clientId)}::uuid` : `client_email = ${q(email)}`;
      conds.push(`booking_id IN (SELECT id FROM bookings WHERE ${inner})`);
    }
    if (!conds.length) continue;

    const sets = [
      ...t.anonymise.map((c) => `${c} = ${q(REDACTED)}`),
      ...t.nullify.map((c) => `${c} = NULL`),
    ];
    if (!sets.length) continue;

    out.push({
      table: t.table,
      deletable: t.deletable,
      why: t.why,
      sql: `UPDATE ${t.table}\n   SET ${sets.join(',\n       ')}\n WHERE ${conds.join('\n    OR ')};`,
    });
  }
  return out;
}

/** The SELECTs that answer "give me a copy of everything you hold about me". */
export function exportPlan({ clientId = null, email = null }) {
  if (!clientId && !email) throw new Error('need a client_id or an email');
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  return PII_MAP.map((t) => {
    const conds = [];
    for (const m of t.match) {
      if (m.endsWith('email') && email) conds.push(`${m} = ${q(email)}`);
      else if (m === 'id' && clientId) conds.push(`${m} = ${q(clientId)}::uuid`);
      else if (m.endsWith('_id') && m !== 'booking_id' && clientId)
        conds.push(`${m} = ${q(clientId)}::uuid`);
    }
    if (t.table === 'job_messages') {
      const inner = clientId ? `client_id = ${q(clientId)}::uuid` : `client_email = ${q(email)}`;
      conds.push(`booking_id IN (SELECT id FROM bookings WHERE ${inner})`);
    }
    return conds.length
      ? { table: t.table, sql: `SELECT * FROM ${t.table} WHERE ${conds.join(' OR ')};` }
      : null;
  }).filter(Boolean);
}

/**
 * El nombre de un cliente tal como se puede mostrar en publico: "Sarah M.".
 *
 * Vivia en api/auth.js, que lo usa para las resenas que sirve el perfil de un
 * mecanico. Se mudo aca el 2026-09-03 porque `api/chat.js?type=reviews`
 * necesitaba el mismo enmascarado y no puede importar auth.js entero -es un
 * handler completo, con su Stripe y su Supabase adentro- solo para recortar un
 * nombre. Este archivo no importa nada, asi que cualquier handler lo puede
 * traer sin costo.
 *
 * La vista `public_reviews` hace exactamente lo mismo en SQL
 * (`split_part` + `left(...,1)`). Que haya dos implementaciones no es ideal,
 * pero la de la vista es la que protege la lectura directa con la anon key y
 * esta no puede reemplazarla.
 */
export function shortClientName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/);
  if (!parts[0]) return 'Dr. Bike client';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}
