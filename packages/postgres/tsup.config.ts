import { defineConfig, Options } from 'tsup';

const esmConfig: Options = {
  format: ['esm'],
  outDir: "dist/esm",
  outExtension: () => ({ js: '.js' }),
  skipNodeModulesBundle: true,
  sourcemap: true,
  target: 'node16'
}

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
    ...esmConfig,
    entry: [
      "src/PostgresConnection.ts"
    ]
  },
  {
    ...esmConfig,
    bundle: false,
    entry: [
      "src/index.ts",
      "src/PGConnection.ts",
      "src/PGLiteConnection.ts"
    ]
  }
]);