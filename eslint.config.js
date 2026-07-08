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
