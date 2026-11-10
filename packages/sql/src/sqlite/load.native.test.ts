import { describe, expect, it } from 'vitest';

import { optional } from './load.native';

describe("optional", () => {
  it("will reject under React Native", async () => {
    await expect(optional("node:sqlite")).rejects.toThrow("node:sqlite does not load under React Native. Pass an Engine instead.");
  })
})
