import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'src') + '/',
      '@hashgraph/stablecoin-npm-sdk': path.resolve(
        __dirname,
        'node_modules/@hashgraph/stablecoin-npm-sdk/dist/cjs/index.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.resolve(__dirname, 'coverage'),
      reporter: ['text', 'html'],
      enabled: false,
    },
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
