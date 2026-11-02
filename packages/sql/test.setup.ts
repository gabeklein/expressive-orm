import { vi } from 'vitest';

export function spy<T extends object, K extends keyof T & string>(target: T, key: K) {
  void target[key];
  return vi.spyOn(target as any, key);
}
