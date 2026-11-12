export const missing =
  "No compatible SQLite driver found. Run under Bun or Node >=24, " +
  "or install one of: better-sqlite3, sqlite3, @libsql/client.";

export function optional(name: string): Promise<any> {
  return import(name);
}
