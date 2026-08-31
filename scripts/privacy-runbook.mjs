#!/usr/bin/env node
// scripts/privacy-runbook.mjs — turn a privacy request into SQL Diego can paste.
//
// Run:  npm run privacy:export    -- --email cliente@ejemplo.com
//       npm run privacy:forget    -- --email cliente@ejemplo.com
//       npm run privacy:forget    -- --id 73c5409b-6298-43b4-9aa6-6ac2a0716c40
//
// Audit point 9. privacy.html promises access and deletion within 30 days, and
// until now there was no way to actually do either: it would have meant
// hand-writing SQL across a dozen tables and remembering which ones hold
// personal data.
//
// WHY THIS PRINTS SQL INSTEAD OF DOING IT
//
// An HTTP endpoint that anonymises a client on request is a weapon: one bad
// call, or one bug in an auth check, and a real client's records are stripped
// with no undo. A script that PRINTS reviewed SQL is a tool. Diego reads it,
// sees which tables it touches and why, and runs it himself - the same way
// every other migration in this project is applied.
//
// It also never emits DELETE. See api/_privacy.js: booking rows carry a
// seven-year retention obligation, so "delete my data" is answered by
// anonymising the identity out of a record that legally has to stay.

import { anonymisationPlan, exportPlan, PII_MAP, NOT_PERSONAL } from '../api/_privacy.js';

const args = process.argv.slice(2);
const mode = args.includes('--export') ? 'export' : args.includes('--forget') ? 'forget' : null;

// `indexOf` returns -1 when the flag is absent, and -1 + 1 is 0 - so the naive
// version read args[0] and happily used the literal string "--forget" as the
// client id, producing `WHERE client_id = 'forget'::uuid`. Caught by running
// it. A generator of SQL that runs against real client records has no business
// guessing what it was given.
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`Falta el valor de ${name}.`);
    process.exit(1);
  }
  return v;
}
const email = flag('--email');
const id = flag('--id');

if (!mode || (!email && !id)) {
  console.error(`
Uso:
  node scripts/privacy-runbook.mjs --export --email cliente@ejemplo.com
  node scripts/privacy-runbook.mjs --forget --email cliente@ejemplo.com
  node scripts/privacy-runbook.mjs --forget --id <uuid del perfil>

  --export   "Quiero una copia de todo lo que tienen sobre mi"
  --forget   "Borren todo lo mio"

Se imprime el SQL. No se ejecuta nada: lo revisas y lo pegas en
Supabase -> SQL Editor. Ver docs/RUNBOOK-PRIVACY.md.
`);
  process.exit(1);
}

// A malformed uuid reaching a WHERE clause is not something to find out about
// halfway through a transaction against real records.
if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  console.error(`--id no parece un uuid: ${id}`);
  process.exit(1);
}
if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`--email no parece un email: ${email}`);
  process.exit(1);
}
const who = { clientId: id, email };

const stamp = new Date().toISOString().slice(0, 10);
const subject = who.email || who.clientId;

if (mode === 'export') {
  console.log(`-- SOLICITUD DE ACCESO A DATOS PERSONALES - ${stamp}`);
  console.log(`-- Titular: ${subject}`);
  console.log(`-- Privacy Act 1988 (Cth). privacy.html promete responder en 30 dias.`);
  console.log(`--`);
  console.log(`-- Corre cada consulta y exporta el resultado (boton Export del`);
  console.log(`-- SQL Editor). Mandale al cliente el conjunto completo.`);
  console.log(`-- Una consulta que devuelve 0 filas TAMBIEN se informa: "no tenemos`);
  console.log(`-- nada tuyo en X" es parte de la respuesta.\n`);
  for (const { table, sql } of exportPlan(who)) {
    console.log(`-- ── ${table} ${'─'.repeat(Math.max(0, 60 - table.length))}`);
    console.log(sql + '\n');
  }
  console.log(`-- Tablas que NO contienen datos personales de un cliente:`);
  for (const [t, why] of Object.entries(NOT_PERSONAL)) console.log(`--   ${t}: ${why}`);
} else {
  const plan = anonymisationPlan(who);
  console.log(`-- SOLICITUD DE BORRADO - ${stamp}`);
  console.log(`-- Titular: ${subject}`);
  console.log(`--`);
  console.log(`-- ESTO NO BORRA FILAS. Anonimiza.`);
  console.log(`-- privacy.html se compromete a guardar los registros de reservas`);
  console.log(`-- SIETE ANOS por obligacion fiscal australiana. Las dos promesas`);
  console.log(`-- conviven asi: el registro financiero queda con sus fechas e`);
  console.log(`-- importes, y se le saca toda la identidad.`);
  console.log(`--`);
  console.log(`-- ANTES DE CORRER: hace el export (--export) y guardalo. Despues de`);
  console.log(`-- esto no hay vuelta atras, y el cliente puede pedir su copia.`);
  console.log(`--`);
  console.log(`-- Corre el BEGIN, revisa los conteos, y recien ahi COMMIT.\n`);
  console.log('BEGIN;\n');
  for (const { table, sql, why } of plan) {
    console.log(`-- ── ${table} ${'─'.repeat(Math.max(0, 60 - table.length))}`);
    console.log(`-- ${why}`);
    console.log(sql + '\n');
  }
  console.log(`-- Revisa que los numeros tengan sentido antes de confirmar.`);
  console.log(`-- Si algo no cuadra: ROLLBACK;\n`);
  console.log('-- COMMIT;');
  console.log(
    `\n-- ${plan.length} tablas tocadas, de ${PII_MAP.length} que contienen datos personales.`
  );
}
