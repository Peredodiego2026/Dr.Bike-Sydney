// scripts/privacy-check.mjs
//
// api/_privacy.js has claimed since the day it was written that
// docs/RUNBOOK-PRIVACY.md is "GENERATED from it by scripts/privacy-check.mjs,
// so the runbook Diego pastes into Supabase cannot drift away from what the
// code says."
//
// That script did not exist. And the runbook had drifted exactly the way the
// comment warned: PII_MAP covers NINE tables, the runbook named ONE. So if a
// client had asked to be erased, the document Diego would have opened explains
// the reasoning perfectly and hands him the SQL for `bookings` alone - leaving
// their name in `profiles`, their bikes, their messages, their abandoned
// checkouts and three mailing lists.
//
// The promise on privacy.html is a legal one under the Privacy Act 1988. This
// makes the claim in the header true.
//
//   node scripts/privacy-check.mjs           fail if the runbook is stale
//   node scripts/privacy-check.mjs --write   regenerate it
//
// Only the block between the two markers is generated. Everything Diego reads
// FIRST - what to do, why it is an anonymisation and not a delete, the seven
// year retention - is hand-written prose above it and is never touched.

import { readFileSync, writeFileSync } from 'node:fs';
import { PII_MAP, REDACTED, anonymisationPlan, exportPlan } from '../api/_privacy.js';

const RUNBOOK = 'docs/RUNBOOK-PRIVACY.md';
const BEGIN = '<!-- BEGIN GENERATED: no edites a mano, sale de api/_privacy.js -->';
const END = '<!-- END GENERATED -->';

// A placeholder that is obviously a placeholder in the middle of a SQL block.
const SAMPLE = { clientId: '00000000-0000-0000-0000-000000000000', email: 'cliente@ejemplo.com' };

function generated() {
  const lines = [];

  lines.push(BEGIN);
  lines.push('');
  lines.push('## Las tablas que guardan datos personales');
  lines.push('');
  lines.push(
    `Salen de \`PII_MAP\` en \`api/_privacy.js\`. Son **${PII_MAP.length}**, y estan todas aca:`
  );
  lines.push('');
  lines.push('| Tabla | Se puede borrar la fila | Por que |');
  lines.push('|---|---|---|');
  for (const t of PII_MAP) {
    lines.push(`| \`${t.table}\` | ${t.deletable ? 'si' : '**NO**'} | ${t.why} |`);
  }
  lines.push('');
  lines.push(
    `Lo que se sobrescribe queda como \`${REDACTED}\`. Un NULL seria ambiguo - "nunca hubo nombre" o "se lo quitaron" - y varias de estas columnas son NOT NULL.`
  );
  lines.push('');

  lines.push('## Como sacar el SQL para un cliente concreto');
  lines.push('');
  lines.push('**Desde el panel, que es lo mas facil:** Admin > Clients > el cliente >');
  lines.push('**Privacy request**. Ahi salen los dos bloques listos para copiar, ya con');
  lines.push('el id y el email de esa persona.');
  lines.push('');
  lines.push('Los bloques de abajo son la misma cosa con datos de ejemplo, para que este');
  lines.push('documento sirva aunque el panel no abra.');
  lines.push('');

  lines.push('## 1. "Quiero una copia de todo lo que tienen mio"');
  lines.push('');
  lines.push('```sql');
  lines.push(...exportPlan(SAMPLE).map((s) => s.sql));
  lines.push('```');
  lines.push('');

  lines.push('## 2. "Borren todo lo mio"');
  lines.push('');
  lines.push('Se corre **despues** de haberle mandado la copia, y una vez que confirmaste');
  lines.push('que es esa persona. No tiene vuelta atras: los valores originales no quedan');
  lines.push('guardados en ningun lado.');
  lines.push('');
  lines.push('```sql');
  lines.push('BEGIN;');
  lines.push('');
  for (const step of anonymisationPlan(SAMPLE)) {
    lines.push(`-- ${step.table}: ${step.why}`);
    lines.push(step.sql);
    lines.push('');
  }
  lines.push('-- Revisa el resultado ANTES de confirmar. Si algo no cuadra: ROLLBACK;');
  lines.push('COMMIT;');
  lines.push('```');
  lines.push('');
  lines.push(END);

  return lines.join('\n');
}

const current = readFileSync(RUNBOOK, 'utf8').replace(/\r\n/g, '\n');
const start = current.indexOf(BEGIN);
const finish = current.indexOf(END);

if (start === -1 || finish === -1) {
  console.error(`x ${RUNBOOK} has no generated block.`);
  console.error(`  Add these two marker lines where the SQL should go:\n\n${BEGIN}\n${END}\n`);
  process.exit(1);
}

const block = current.slice(start, finish + END.length);
const fresh = generated();

if (process.argv.includes('--write')) {
  writeFileSync(RUNBOOK, current.slice(0, start) + fresh + current.slice(finish + END.length));
  console.log(`ok privacy-check: regenerated ${RUNBOOK} from api/_privacy.js`);
  process.exit(0);
}

if (block !== fresh) {
  console.error(`x ${RUNBOOK} no longer matches api/_privacy.js.`);
  console.error('  A table, a column or a retention reason changed in the code and the');
  console.error('  runbook still describes the old shape. That document is what gets run');
  console.error('  against a real client when someone asks to be erased.');
  console.error('\n  Fix it with:  node scripts/privacy-check.mjs --write\n');
  process.exit(1);
}

console.log(
  `ok privacy-check: the runbook covers all ${PII_MAP.length} tables that hold personal data`
);
