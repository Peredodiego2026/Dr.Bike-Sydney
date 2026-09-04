// The other half of audit finding 1 (2026-09-04).
//
// api/_admin-aal.js closed the fourteen admin-* server routes. The panel barely
// uses them: it reads Supabase straight from the browser, and every policy in
// the database asks only whether you are an admin, never whether you completed
// the second factor. Confirmed from production twice - see
// docs/PENDIENTES.md 98.
//
// The SQL that fixes it cannot be run from here, and must not be: a policy
// change has no Instant Rollback. It lives in docs/RUNBOOK-RLS-AAL2.md as steps
// Diego runs by hand, one at a time, testing between each.
//
// So what IS testable is the runbook's own safety properties. A document is not
// self-verifying; these assertions are what stop it drifting into something
// that would lock the only admin out of the business.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = readFileSync(join(root, 'docs', 'RUNBOOK-RLS-AAL2.md'), 'utf8');

// Every ```sql fence in the document, in order.
const sqlBlocks = [...doc.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
const allSql = sqlBlocks.join('\n');

describe('the rule the runbook installs', () => {
  it('fails OPEN on a missing claim, which is the whole design', () => {
    // `= 'aal2'` would reject every request the moment the claim stopped being
    // emitted - the outage arrived at by assumption, which api/_admin-aal.js
    // exists to avoid. `is distinct from 'aal1'` only rejects an explicit aal1.
    expect(allSql).toContain("(auth.jwt() ->> 'aal') is distinct from 'aal1'");
    expect(allSql).not.toMatch(/auth\.jwt\(\)\s*->>\s*'aal'\s*=\s*'aal2'/);
  });

  it('is conditional, so an admin with no factor can still enrol', () => {
    // Demanding the second factor from an account that has none leaves it
    // unable to reach the enrolment screen, with the fix behind the door that
    // just closed. Same rule as adminAalVerdict().
    expect(allSql).toMatch(/or not exists \(\s*select 1 from auth\.mfa_factors f/);
    expect(allSql).toMatch(/f\.status = 'verified'/);
  });

  it('matches what the JavaScript already does, so the two cannot disagree', () => {
    const js = readFileSync(join(root, 'api', '_admin-aal.js'), 'utf8');
    // Both must treat an absent claim as "allow".
    expect(js).toMatch(/if \(!aal\) return decide\('no-aal-claim', false\)/);
    expect(doc).toContain('api/_admin-aal.js');
  });
});

describe('every policy it adds', () => {
  const policyStatements = allSql
    .split(/;\s*/)
    .filter((s) => /create policy/i.test(s));

  it('there is at least one, or the runbook does nothing', () => {
    expect(policyStatements.length).toBeGreaterThan(0);
  });

  it('is RESTRICTIVE - a permissive one would grant access instead of limiting it', () => {
    // This is the failure mode that looks identical in the dashboard and does
    // the opposite: a permissive policy is OR'd with the existing ones, so it
    // would widen access rather than narrow it, silently.
    for (const s of policyStatements) {
      expect(s, `not restrictive:\n${s}`).toMatch(/as restrictive/i);
    }
  });

  it('guards reads AND writes', () => {
    for (const s of policyStatements) {
      expect(s, `no using():\n${s}`).toMatch(/using \(public\.has_second_factor\(\)\)/);
      expect(s, `no with check():\n${s}`).toMatch(/with check \(public\.has_second_factor\(\)\)/);
    }
  });

  it('leaves the existing policies alone - it adds, never rewrites', () => {
    // Rewriting a policy means knowing its exact name in PRODUCTION, and this
    // repo's SQL is not proof of what production holds (memory: "prod RLS is
    // stricter than the committed SQL"). Dropping the wrong one locks somebody
    // out with no rollback.
    const dropped = [...allSql.matchAll(/drop policy if exists (\w+)/g)].map((m) => m[1]);
    for (const name of dropped) {
      expect(name, `${name} is not one this runbook created`).toMatch(
        /_requires_second_factor$/
      );
    }
  });
});

describe('every step is reversible, and says so before it acts', () => {
  // The order matters more than the presence: a reversion printed after the
  // step is a reversion you read once the panel is already dark.
  const steps = [...doc.matchAll(/### (Reversion del paso \d+|El paso \d+)/g)].map(
    (m) => m[1]
  );

  it('pairs a reversion with every step', () => {
    const reversions = steps.filter((s) => s.startsWith('Reversion')).length;
    const actions = steps.filter((s) => s.startsWith('El paso')).length;
    expect(actions).toBeGreaterThan(0);
    expect(reversions).toBe(actions);
  });

  it('puts the reversion BEFORE the step it undoes', () => {
    for (let i = 0; i < steps.length; i += 2) {
      expect(steps[i], `out of order at ${steps[i]}`).toMatch(/^Reversion del paso (\d+)$/);
      const n = steps[i].match(/\d+/)[0];
      expect(steps[i + 1]).toBe(`El paso ${n}`);
    }
  });

  it('can undo every policy it creates', () => {
    const created = [...allSql.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
    const dropped = [...allSql.matchAll(/drop policy if exists (\w+)/g)].map((m) => m[1]);
    for (const name of created) {
      expect(dropped, `${name} has no drop`).toContain(name);
    }
  });

  it('can undo the function too', () => {
    expect(allSql).toMatch(/create or replace function public\.has_second_factor\(\)/);
    expect(allSql).toMatch(/drop function if exists public\.has_second_factor\(\)/);
  });
});

describe('the order it puts the tables in', () => {
  const at = (t) => doc.indexOf(`public.${t}\n`) >= 0 ? doc.indexOf(`public.${t}`) : -1;

  it('leaves bookings for last', () => {
    // bookings holds the names, phones and addresses AND is what every client
    // reads to see their own booking. A mistake there does not break the panel,
    // it breaks the app.
    const bookings = doc.lastIndexOf('bookings_requires_second_factor');
    for (const other of [
      'availability_requires_second_factor',
      'mechanic_locations_requires_second_factor',
      'discount_codes_requires_second_factor',
      'van_zones_requires_second_factor',
    ]) {
      expect(doc.lastIndexOf(other), `${other} comes after bookings`).toBeLessThan(bookings);
    }
  });

  it('starts with a step that changes no policy at all', () => {
    const step1 = doc.slice(doc.indexOf('## 3. PASO 1'), doc.indexOf('## 4. PASO 2'));
    expect(step1).toMatch(/create or replace function/);
    expect(step1).not.toMatch(/create policy/);
  });
});

describe('it tells Diego to verify, not to trust', () => {
  it('every step carries its own check', () => {
    const checks = (doc.match(/### Comprobacion del paso \d+/g) || []).length;
    const actions = (doc.match(/### El paso \d+/g) || []).length;
    expect(checks).toBe(actions);
  });

  it('says out loud that a policy change has no Instant Rollback', () => {
    expect(doc).toMatch(/no tiene ese boton|no tiene el boton/i);
  });

  it('names the client-side check for the tables a customer also reads', () => {
    // mechanic_locations and van_zones are read by ordinary clients too. The
    // function lets them through because they have no factor - but that has to
    // be SEEN, not assumed.
    const step3 = doc.slice(doc.indexOf('## 5. PASO 3'), doc.indexOf('## 6. PASO 4'));
    expect(step3).toMatch(/celular/);
    expect(step3).toMatch(/cliente comun/);
  });
});

describe('it is not filed as a migration', () => {
  it('is not in scripts/, so it cannot be run by inertia off the migration list', () => {
    // docs/RUNBOOK-SQL.md's query is a to-do list. A file in scripts/ shows up
    // there as ">>> FALTA <<<", which invites running it without reading the
    // precautions - and this is the one piece of SQL in the project that must
    // not be run that way.
    const sqlFiles = readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('.sql'));
    for (const f of sqlFiles) {
      expect(f).not.toMatch(/aal|second.factor/i);
    }
  });
});
