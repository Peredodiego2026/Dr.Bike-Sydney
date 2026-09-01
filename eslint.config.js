import pluginSecurity from 'eslint-plugin-security';
import pluginN from 'eslint-plugin-n';

export default [
  {
    ignores: ['node_modules/**', '.vercel/**', '*.min.js'],
  },
  {
    files: ['api/**/*.js', 'js/**/*.js', 'middleware.js'],
    plugins: {
      security: pluginSecurity,
      n: pluginN,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        requestAnimationFrame: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Notification: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        Image: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        NodeFilter: 'readonly',
        performance: 'readonly',
        indexedDB: 'readonly',
        atob: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        L: 'readonly',
        gtag: 'readonly',
        posthog: 'readonly',
        fbq: 'readonly',
        Stripe: 'readonly',
        turnstile: 'readonly',
        supabase: 'readonly',
        Sentry: 'readonly',
      },
    },
    rules: {
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'warn',
      'security/detect-possible-timing-attacks': 'warn',

      // Node.js rules
      'n/no-process-exit': 'warn',
      'n/no-sync': 'warn',

      // General best practices
      // Una variable usada fuera de su alcance es sintaxis VALIDA: `node
      // --check` pasa y revienta recien en produccion. Ya paso dos veces en
      // este repo (el `holdOnly` de la reserva, y SERVICE_KEY/booking_id en
      // el reembolso de cancelacion, que hacia que el credito de referido
      // nunca se devolviera). Esto es lo unico que lo agarra antes.
      'no-undef': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
