import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: {
      // Mirrors the `@/*` path in tsconfig; vitest does not read tsconfig paths.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
