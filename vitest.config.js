import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      reporter: ['text', 'json'],
      include: ['api/**/*.js', 'js/**/*.js'],
      exclude: ['node_modules/**'],
    },
  },
});
