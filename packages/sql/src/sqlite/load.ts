export function optional(name: string): Promise<any> {
  return import(name);
}
