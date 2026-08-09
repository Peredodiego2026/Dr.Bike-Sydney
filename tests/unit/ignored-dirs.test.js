// The repo-wide checks used to walk directories git ignores, so running the
// Playwright suite once made `npm run check` fail locally on generated HTML
// that is not part of the repo. CI never reproduced it.
import { describe, it, expect } from 'vitest';
import { IGNORED_DIRS } from '../../scripts/lib/ignored-dirs.mjs';

describe('IGNORED_DIRS', () => {
  it('covers the generated directories that produced the false positive', () => {
    for (const dir of ['playwright-report', 'test-results', 'coverage', 'dist', '.vercel']) {
      expect(IGNORED_DIRS.has(dir), `${dir} must be skipped by the tree walks`).toBe(true);
    }
  });

  it('always skips node_modules and .git, gitignore or not', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('.git')).toBe(true);
  });

  it('does not swallow a directory the repo actually tracks', () => {
    for (const dir of ['js', 'css', 'api', 'blog', 'es', 'zh', 'images', 'scripts', 'tests']) {
      expect(IGNORED_DIRS.has(dir), `${dir} is repo content and must still be checked`).toBe(false);
    }
  });
});
