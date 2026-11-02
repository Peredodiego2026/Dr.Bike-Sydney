// Which directories a repo-wide sweep must not walk into.
//
// Why it exists: the checks that walk the whole tree (icons-check, color-check)
// hardcoded a three-name skip list - node_modules, .git, docs - and walked
// everything else, including directories git itself ignores. Run the Playwright
// suite once and `playwright-report/` appears with four generated HTML files
// that have no <link rel="icon">; `npm run check` then fails locally with four
// problems that do not exist in the repo. CI never saw it, because CI never has
// that directory, so the failure only ever hit whoever ran the tests last.
//
// The source of truth is .gitignore: if git does not track it, a check about
// what this repo ships has no business reading it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Names that are never repo content, whether or not .gitignore mentions them.
const ALWAYS = ['node_modules', '.git'];

function fromGitignore() {
  if (!existsSync('.gitignore')) return [];
  return readFileSync('.gitignore', 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
    // Only plain names survive: a pattern with a glob or a path separator in
    // the middle is not a "skip this directory by name" rule and pretending
    // otherwise would skip more than git does.
    .filter(l => !/[*?[\]]/.test(l))
    .map(l => l.replace(/^\/+|\/+$/g, ''))
    .filter(l => l && !l.includes('/'));
}

/** Directory names a tree walk should skip. Matched by name, at any depth. */
export const IGNORED_DIRS = new Set([...ALWAYS, ...fromGitignore()]);

// A directory with its own `.git` (a file for a worktree, a folder for a
// clone) is another checkout, not part of this one - git never descends into
// it either. Claude Code puts its worktrees in .claude/worktrees/, ignored only
// through .git/info/exclude, which the name list above cannot read: with one
// worktree present, color-check reported the retired blue in that worktree's
// own copy of color-check.mjs and `npm run check` failed locally on problems
// the repo does not have (2026-11-02).
/** True for a nested checkout a tree walk must not enter. */
export function isNestedCheckout(dir) {
  return existsSync(join(dir, '.git'));
}
