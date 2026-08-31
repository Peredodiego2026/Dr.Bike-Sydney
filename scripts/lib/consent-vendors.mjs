// The vendor globals a page-loaded .js file must never touch, and why.
//
// Split out of scripts/consent-gate.mjs so a test can exercise the patterns
// directly - the script itself is a top-level side-effecting CLI.
//
// Only the two that actually bit are here. A vendor whose snippet installs its
// own stub (PostHog) is not in this class, and guessing at more would cost
// false positives - which is how a check stops being read.
export const VENDOR_USES = [
  { name: 'Sentry', re: /^\s*Sentry\s*\./m, why: 'the loader is consent-gated, so Sentry is undefined until then' },
  {
    name: 'Google Analytics',
    re: /^\s*gtag\(\s*['"](?:js|config)['"]/m,
    why: 'this configures GA before anyone agreed to anything',
  },
];
