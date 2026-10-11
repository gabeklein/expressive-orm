import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = fileURLToPath(new URL('packages/', import.meta.url));

type Thresholds = { statements: number; branches: number; functions: number; lines: number };

export function suite(thresholds: Thresholds = { statements: 100, branches: 100, functions: 100, lines: 100 }) {
  return defineConfig({
    resolve: {
      alias: [
        { find: /^@expressive\/([^/]+)$/, replacement: `${packages}$1/src` },
        { find: /^@expressive\/([^/]+)\/(.+)$/, replacement: `${packages}$1/src/$2` }
      ]
    },
    test: {
      include: ['src/**/*.test.*'],
      setupFiles: ['./test.setup.ts'],
      coverage: {
        provider: 'istanbul',
        include: ['src/**'],
        reporter: ['text-summary', 'lcov'],
        thresholds
      }
    }
  });
}

export default defineConfig({
  test: {
    projects: ['packages/*']
  }
});
