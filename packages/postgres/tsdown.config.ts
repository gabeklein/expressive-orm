import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/tests/**',
    '!src/**/TestConnection.ts'
  ],
  format: ['esm'],
  outDir: 'dist',
  outExtensions: () => ({ js: '.js' }),
  sourcemap: true,
  unbundle: true,
  // pg is an optional peer (declared under devDependencies), so it is not
  // auto-externalized; keep it and pglite out of the bundle like the old build.
  external: ['pg', '@electric-sql/pglite'],
  outputOptions: {
    exports: 'named'
  }
});
