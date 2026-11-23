import { command } from '@expressive/cli';
import { expect, it, vi } from 'vitest';

const main = vi.hoisted(() => vi.fn((_meta: unknown, Type: unknown) => Type));

vi.mock("@expressive/cli", async (actual) => ({ ...(await actual<object>()), main }));

it("will export Sql as a member of the expressive command", async () => {
  const { default: Sql } = await import("./bin");
  const out = { log: vi.fn(), error: vi.fn() };

  expect(Sql).toBe((await import("./cli")).default);
  expect(main).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/bin\.ts$/) }), Sql, { as: "expressive" });

  expect(await command(Sql)(["help", "sync"], out, "expressive sql")).toBe(0);
  expect(out.log.mock.calls.pop()![0]).toMatch(/^Usage: expressive sql sync \[options\] <entry>\n\nCreate missing tables/);

  expect(await command(Sql)([], out, "expressive sql")).toBe(0);
  expect(out.log.mock.calls[0][0]).toMatch(/^Usage: expressive sql \[options\] <command>\n\nCheck or sync a database schema/);
});
