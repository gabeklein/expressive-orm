import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Output = Pick<Console, "log" | "error">;

type Command = (args: string[], out: Output) => Promise<number>;

function scopes(cwd: string){
  const found: string[] = [];

  for (let dir = cwd; ; dir = dirname(dir)) {
    const scope = join(dir, "node_modules", "@expressive");

    if (existsSync(scope))
      found.push(scope);

    if (dirname(dir) == dir)
      return found;
  }
}

function manifest(dir: string): { bin?: string } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).expressive;
  }
  catch {
    return;
  }
}

function commands(cwd: string){
  const found = new Map<string, string>();

  for (const scope of scopes(cwd))
    for (const name of readdirSync(scope)) {
      const bin = manifest(join(scope, name))?.bin;

      if (bin && !found.has(name))
        found.set(name, join(scope, name, bin));
    }

  return found;
}

export async function dispatch(args: string[], cwd: string, out: Output): Promise<number> {
  const [name, ...rest] = args;
  const available = commands(cwd);
  const bin = name && available.get(name);

  if (!bin) {
    const list = Array.from(available.keys()).join(", ") || "none installed";

    out.error(`${name ? `No expressive command "${name}".` : "Usage: expressive <command> ..."} Available: ${list}.`);
    return 2;
  }

  const { default: run } = await import(pathToFileURL(bin).href) as { default: Command };

  return run(rest, out);
}
