import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { optional } from './load.native';

describe("optional", () => {
  it("will reject under React Native", async () => {
    await expect(optional("node:sqlite")).rejects.toThrow("node:sqlite does not load under React Native. Pass an Engine instead.");
  })
})

describe("react-native field", () => {
  it("will map built files to their sources", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const source = (file: string) => new URL("../../" + file.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts"), import.meta.url);

    for (const [from, to] of Object.entries<string>(pkg["react-native"])) {
      expect(existsSync(source(from))).toBe(true);
      expect(existsSync(source(to))).toBe(true);
    }
  })
})
