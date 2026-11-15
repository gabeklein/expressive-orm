import { command } from '@expressive/cli';
import type { Model } from '@expressive/mvc';
import { expect, it, vi } from 'vitest';

const main = vi.hoisted(() => vi.fn());

vi.mock("@expressive/cli", async (actual) => ({ ...(await actual<object>()), main }));

it("will export Sql and run the expressive command as entry", async () => {
  const { default: Sql } = await import("./bin");
  const [[meta, Expressive]] = main.mock.calls as [[ImportMeta, Model.Type]];
  const out = { log: vi.fn(), error: vi.fn() };

  expect(Sql).toBe((await import("./cli")).default);
  expect(meta.url).toMatch(/bin\.ts$/);

  expect(await command(Expressive)(["sql", "help", "sync"], out)).toBe(0);
  expect(out.log.mock.calls.pop()![0]).toMatch(/^Usage: expressive sql sync \[options\] <entry>\n\nCreate missing tables/);

  expect(await command(Expressive)([], out)).toBe(0);
  expect(out.log.mock.calls[0][0]).toMatch(/^Usage: expressive \[options\] <command>\n\nCommands:\n {2}dev +Run the app - Vite[^\n]*\n {2}sql +Check or sync/);
})
