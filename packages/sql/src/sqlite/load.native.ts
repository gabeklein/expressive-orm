export async function optional(name: string): Promise<any> {
  throw new Error(`${name} does not load under React Native. Pass an Engine instead.`);
}
