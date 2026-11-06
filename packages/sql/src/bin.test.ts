import { expect, it, vi } from 'vitest';

it("will dispatch argv and set the exit code", async () => {
  const dispatch = vi.fn(async () => 7);
  const { argv, exitCode } = process;

  vi.doMock("./dispatch", () => ({ dispatch }));
  process.argv = ["node", "expressive", "sql", "check"];

  try {
    await import("./bin");

    expect(dispatch).toHaveBeenCalledWith(["sql", "check"], process.cwd(), console);
    expect(process.exitCode).toBe(7);
  }
  finally {
    process.argv = argv;
    process.exitCode = exitCode;
  }
})
