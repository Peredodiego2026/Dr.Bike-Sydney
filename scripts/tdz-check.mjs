// scripts/tdz-check.mjs
//
// Reading a `const`/`let` above its own declaration line is valid syntax. It
// parses, `node --check` passes, ESLint's `no-undef` says nothing - and at
// runtime it throws ReferenceError: Cannot access 'x' before initialization.
//
// In a render function that error lands before the first `screen.innerHTML`,
// so the screen div stays empty: a totally white page with nothing to tap, no
// spinner and no visible error. That is exactly what Diego hit on his phone
// every time he opened the quote summary (docs/PENDIENTES.md 81), and it only
// fired for him because the offending read sat behind `if (window.posthog)` -
// analytics loads only after cookie consent, so the bug was invisible to
// anyone who had not accepted.
//
// `no-use-before-define` is the stock rule for this, but it also flags the
// harmless and very common shape:
//
//     const close = () => { document.removeEventListener('keydown', onKey); };
//     const onKey = (e) => { ... };          // declared after, called later
//
// `close` only runs once the user clicks, long after `onKey` exists. Turning
// the rule on wholesale means 13 of those across the client JS, and 13
// eslint-disable comments would bury the one that matters.
//
// So this checks the narrower, always-broken shape: the read and the
// declaration are in the SAME function body, with nothing deferring the read.
// That one cannot work - the line runs on the way to the declaration.

import { Linter } from 'eslint';
import { readFileSync } from 'node:fs';

const FILES = [
  'js/app.js',
  'js/admin.js',
  'js/mechanic.js',
  'js/components.js',
  'js/landing-inline.js',
  'js/router.js',
  'js/supabase.js',
  'js/stripe.js',
  'js/i18n.js',
  'js/consent.js',
];

// The function (or module) body a scope belongs to. Two references share this
// only when neither sits inside a nested function relative to the other.
const owningBody = (scope) => {
  let s = scope;
  while (s && s.type !== 'function' && s.type !== 'module' && s.type !== 'global') s = s.upper;
  return s;
};

const rule = {
  create(context) {
    return {
      'Program:exit'() {
        const walk = (scope) => {
          for (const ref of scope.references) {
            const v = ref.resolved;
            if (!v || !v.defs.length) continue;
            const def = v.defs[0];
            // `var` hoists to undefined - no temporal dead zone, no throw.
            if (def.type !== 'Variable' || def.parent.kind === 'var') continue;
            if (ref.identifier.range[0] >= def.name.range[0]) continue; // read after: fine
            if (owningBody(ref.from) !== owningBody(v.scope)) continue; // deferred: fine
            context.report({
              node: ref.identifier,
              message: `'${v.name}' is read on line ${ref.identifier.loc.start.line} but declared on line ${def.name.loc.start.line}, in the same function body. This throws ReferenceError every time the function runs.`,
            });
          }
          scope.childScopes.forEach(walk);
        };
        walk(context.sourceCode.scopeManager.globalScope);
      },
    };
  },
};

const linter = new Linter();
let failed = false;

for (const file of FILES) {
  const code = readFileSync(file, 'utf8');
  const messages = linter.verify(code, [
    {
      plugins: { tdz: { rules: { 'same-scope': rule } } },
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'tdz/same-scope': 'error' },
    },
  ]);
  // The file's own eslint-disable comments name rules this minimal config does
  // not enable, and the Linter reports each as an unused directive. Not ours.
  for (const m of messages.filter((m) => m.ruleId === 'tdz/same-scope')) {
    failed = true;
    console.error(`x ${file}:${m.line} ${m.message}`);
  }
}

if (failed) {
  console.error('\nMove the declaration above the read, or move the read below it.');
  process.exit(1);
}

console.log('ok tdz-check: no read of a const/let above its own declaration');
