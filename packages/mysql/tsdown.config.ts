import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/tests/**'
  ],
  format: ['esm'],
  outDir: 'dist',
  outExtensions: () => ({ js: '.js' }),
  sourcemap: true,
  unbundle: true,
  external: ['mysql2', 'mysql2/promise'],
  outputOptions: {
    exports: 'named'
  }
});
