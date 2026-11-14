import { expect, it, vi } from 'vitest';

it("will run the expressive trunk and set the exit code", async () => {
  const run = vi.fn(async () => 7);
  const trunk = vi.fn(() => run);
  const { argv, exitCode } = process;

  vi.doMock("@expressive/cli/bin", () => ({ trunk }));
  process.argv = ["node", "expressive", "sql", "check"];

  try {
    await import("./bin");

    expect(trunk).toHaveBeenCalledWith("expressive");
    expect(run).toHaveBeenCalledWith(["sql", "check"], console);
    expect(process.exitCode).toBe(7);
  }
  finally {
    process.argv = argv;
    process.exitCode = exitCode;
  }
})
