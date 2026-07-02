// Bun injects the test lifecycle functions as globals at runtime, but
// @types/bun only declares them on the "bun:test" module. Re-expose them
// globally so test files can use the bare globals without importing.
declare global {
  const describe: typeof import("bun:test").describe;
  const it: typeof import("bun:test").it;
  const test: typeof import("bun:test").test;
  const expect: typeof import("bun:test").expect;
  const beforeAll: typeof import("bun:test").beforeAll;
  const beforeEach: typeof import("bun:test").beforeEach;
  const afterAll: typeof import("bun:test").afterAll;
  const afterEach: typeof import("bun:test").afterEach;
  const mock: typeof import("bun:test").mock;
  const spyOn: typeof import("bun:test").spyOn;
  const vi: typeof import("bun:test").vi;
}

export {};
