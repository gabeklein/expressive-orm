import { mergeConfig } from 'vitest/config';

import { suite } from '../../vitest.config.ts';

export default mergeConfig(suite({ statements: 96, branches: 85, functions: 96, lines: 96 }), {
  test: {
    globalSetup: ['./test.global.ts'],
    hookTimeout: 120_000
  }
});
