import { defineConfig } from 'tsup';
import * as path from 'node:path';

const srcAlias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: 'dist/esm',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    external: ['@hiero-ledger/sdk'],
    target: 'es2022',
    outExtension() {
      return { js: '.mjs' };
    },
    esbuildOptions(options) {
      options.alias = srcAlias;
    },
  },
  {
    entry: ['./src/index.ts'],
    outDir: 'dist/cjs',
    format: ['cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    external: ['@hiero-ledger/sdk'],
    target: 'node16',
    esbuildOptions(options) {
      options.alias = srcAlias;
    },
  },
]);
