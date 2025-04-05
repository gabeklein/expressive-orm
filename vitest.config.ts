import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    tsconfigPaths()
  ],
  test: {
    coverage: {
      provider: 'v8',
      exclude: [
        'node_modules'
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    },
    globals: true,
    setupFiles: [
      `${__dirname}/vitest.setup.ts`
    ]
  }
})