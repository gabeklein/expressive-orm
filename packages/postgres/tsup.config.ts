import { defineConfig } from 'tsup';

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: ["src/index.ts"],
    format: ['cjs'],
    outDir: "dist",
    skipNodeModulesBundle: true,
    sourcemap: true,
  },
  {
    entry: ["src/*.ts", "!src/**/*.test.ts"],
    format: ['esm'],
    outDir: "dist/esm",
    outExtension: () => ({ js: '.js' }),
    skipNodeModulesBundle: true,
    sourcemap: "inline",
    splitting: false,
  }
]);