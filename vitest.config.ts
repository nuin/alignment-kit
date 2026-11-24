import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'],
  coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx,js}'], reporter: ['text', 'lcov'],
    thresholds: { statements: 90, branches: 80, functions: 90, lines: 95 } } } });
