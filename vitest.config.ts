// vitest.config.ts — a separate config from electron.vite.config.ts on
// purpose: tests run under plain Node (no Electron runtime), so 'electron'
// is aliased to a minimal stub (test/electron-stub.ts) rather than actually
// resolving the real module, which would throw outside a running app.
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'test/electron-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
