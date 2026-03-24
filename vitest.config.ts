import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['submodules/**', '.pnpm-store/**', 'node_modules/**', 'dist/**'],
  },
});
