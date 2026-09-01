#!/usr/bin/env node
// scripts/restore-backup.mjs — put a nightly backup back into a database.
//
// Run:  node scripts/restore-backup.mjs --file drbike-backup-2026-09-01.json --dry-run
//       node scripts/restore-backup.mjs --file drbike-backup-2026-09-01.json --url https://xxx.supabase.co --key <service_key>
//
// WHY THIS EXISTS
//
// The audit's complaint about backups was never "there are none" - it was that
// nobody had ever restored one, which makes a backup a promise rather than a
// fact. api/_backup.js closed the first half by producing a file every night.
// This closes the second: the file can be read back, and every row in it lands
// in a table again.
//
// --dry-run needs no database and no credentials. It parses the file, reports
// what it holds, and refuses it if anything is wrong. That is the check worth
// running on every backup as it arrives; the real restore is for the day
// something has actually gone wrong.
//
// SAFETY
//
// A restore writes. Everything here is built so it cannot write to the wrong
// place or write nonsense:
//
//   - --dry-run is the DEFAULT. Writing requires --url and --key explicitly.
//   - It refuses to run against the live project unless --i-know-this-is-live
//     is passed. Restoring over a healthy production database is how a backup
//     turns into the disaster it was meant to prevent.
//   - An incomplete backup (a table that failed the night it was taken) is
//     refused unless --allow-incomplete. Restoring half a database silently is
//     worse than not restoring.
//   - Rows are upserted in batches, never deleted. Nothing here removes data.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// The project this repo talks to. Named so the guard below can recognise it.
const LIVE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const BATCH = 500;

// Only run the CLI when this file IS the command. Importing it - which the
// round-trip test does, to drive the real validator rather than a copy of it -
// must not parse argv or exit the process. A module that exits on import is
// not a module.
const IS_CLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function flag(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return !v || v.startsWith('--') ? null : v;
}
const has = (name) => process.argv.includes(name);

/**
 * Everything that must be true before a file is treated as a backup.
 * Exported so it can be tested without a file on disk or a database.
 */
export function validateBackup(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') return ['no es un objeto JSON'];
  if (!payload.generated_at) problems.push('no dice cuando se genero');
  if (!payload.data || typeof payload.data !== 'object') problems.push('no tiene bloque `data`');
  if (typeof payload.complete !== 'boolean') problems.push('no dice si esta completo');

  const failed = [];
  const counts = {};
  for (const [table, rows] of Object.entries(payload.data || {})) {
    // api/_backup.js records a failed table AS an object with this key rather
    // than dropping it, precisely so a restore can tell "failed" from "empty".
    if (rows && !Array.isArray(rows) && rows.__backup_error__) {
      failed.push({ table, error: rows.__backup_error__ });
      continue;
    }
    if (!Array.isArray(rows)) {
      problems.push(`${table}: no es una lista de filas`);
      continue;
    }
    counts[table] = rows.length;
  }

  // A count that disagrees with the rows actually present means the file was
  // truncated or edited after it was written.
  for (const [table, n] of Object.entries(payload.table_counts || {})) {
    if (n === null) continue;
    if (counts[table] !== undefined && counts[table] !== n) {
      problems.push(`${table}: dice ${n} filas y trae ${counts[table]}`);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { problems, failed, counts, total };
}

if (IS_CLI) {
  const file = flag('--file');
  const url = flag('--url');
  const key = flag('--key');
  const dryRun = has('--dry-run') || !url || !key;

  if (!file) {
    console.error(`
  Uso:
    node scripts/restore-backup.mjs --file <backup.json> --dry-run
    node scripts/restore-backup.mjs --file <backup.json> --url <supabase-url> --key <service_key>

    --dry-run   Lee y valida el archivo. No escribe nada. Es el modo por defecto.
    --allow-incomplete   Restaurar aunque el backup tenga tablas que fallaron.
    --i-know-this-is-live   Requerido para escribir sobre el proyecto de produccion.
  `);
    process.exit(1);
  }

  // ── Read and validate ───────────────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`No se pudo leer el archivo: ${e.message}`);
    process.exit(1);
  }

  const v = validateBackup(payload);
  if (Array.isArray(v)) {
    console.error('Archivo invalido:', v.join('; '));
    process.exit(1);
  }

  console.log(`\nBackup del ${payload.generated_at}`);
  console.log(`Tablas: ${Object.keys(v.counts).length}   Filas: ${v.total}`);
  console.log(`Completo: ${payload.complete ? 'si' : 'NO'}`);
  if (v.failed.length) {
    console.log(`\nTablas que fallaron la noche que se tomo:`);
    for (const f of v.failed) console.log(`  ${f.table}: ${f.error}`);
  }
  if (v.problems.length) {
    console.error(`\nPROBLEMAS EN EL ARCHIVO:`);
    for (const p of v.problems) console.error(`  x ${p}`);
    process.exit(1);
  }

  console.log(`\nFilas por tabla:`);
  for (const [t, n] of Object.entries(v.counts).sort())
    console.log(`  ${String(n).padStart(6)}  ${t}`);

  if (!payload.complete && !has('--allow-incomplete')) {
    console.error(
      `\nEste backup esta INCOMPLETO. Restaurar media base en silencio es peor que` +
        `\nno restaurar. Si igual queres hacerlo, agrega --allow-incomplete.`
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\nOK - el archivo es valido y se puede restaurar.`);
    console.log(`Modo lectura: no se escribio nada. Para restaurar de verdad,`);
    console.log(`pasa --url y --key de un proyecto Supabase VACIO.\n`);
    process.exit(0);
  }

  // ── Write ───────────────────────────────────────────────────────────────────
  if (url.replace(/\/$/, '') === LIVE_URL && !has('--i-know-this-is-live')) {
    console.error(
      `\nESE ES EL PROYECTO DE PRODUCCION.\n` +
        `Restaurar encima de una base sana es como un backup se convierte en el\n` +
        `desastre que venia a evitar. Si de verdad es lo que queres, agrega\n` +
        `--i-know-this-is-live.\n`
    );
    process.exit(1);
  }

  let written = 0;
  const failures = [];
  for (const [table, rows] of Object.entries(payload.data)) {
    if (!Array.isArray(rows) || !rows.length) continue;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          // Upsert: a restore run twice must not fail on rows already back.
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(chunk),
      });
      if (!r.ok) {
        failures.push(
          `${table}[${i}-${i + chunk.length}]: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`
        );
      } else {
        written += chunk.length;
      }
    }
    process.stdout.write(`  ${table}\n`);
  }

  console.log(`\nFilas escritas: ${written}`);
  if (failures.length) {
    console.error(`\n${failures.length} lote(s) fallaron:`);
    for (const f of failures) console.error(`  x ${f}`);
    process.exit(1);
  }
  console.log('Restauracion completa.\n');
}
