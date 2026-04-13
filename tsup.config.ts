import * as path from 'node:path';
import { defineConfig } from 'tsup';

const srcAlias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: 'dist/esm',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    esbuildOptions(options) {
      options.alias = srcAlias;
    },
  },
  {
    entry: ['./src/index.ts'],
    outDir: 'dist/cjs',
    format: ['cjs'],
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    esbuildOptions(options) {
      options.alias = srcAlias;
    },
  },
]);
