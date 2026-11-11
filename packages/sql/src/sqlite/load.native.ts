import type * as load from './load';

export const missing: typeof load.missing =
  "SQLite does not load under React Native. Pass an Engine instead.";

export const optional: typeof load.optional = async (name) => {
  throw new Error(`${name} does not load under React Native. Pass an Engine instead.`);
}
