import { defineConfig, Options } from 'tsup';

const base: Options = {
  format: ['esm'],
  outDir: "dist/esm",
  outExtension: () => ({ js: '.js' }),
  sourcemap: true,
  target: 'node16',
  external: [
    "@electric-sql/pglite",
    '@expressive/sql',
    "pg",
  ],
}

export default defineConfig([
  {
    ...base,
    clean: true,
    dts: true,
    entry: ["src/index.ts"],
    format: ['cjs'],
    outDir: "dist",
  },
  {
    ...base,
    entry: [
      "src/PostgresConnection.ts"
    ]
  },
  {
    ...base,
    bundle: false,
    entry: [
      "src/index.ts",
      "src/PGConnection.ts",
      "src/PGLiteConnection.ts"
    ]
  }
]);