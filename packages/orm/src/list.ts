import { event, listener, touch } from '@expressive/mvc/observable';

import { match, NULL } from './query/evaluate';
import type { Type } from './Type';

type Row = Record<string, unknown>;

interface Live {
  items: Type[];
  proxy: Type[];
  filter?: Type.Constraint[];
}

const SHAPE = Symbol("shape");
const LISTS = new WeakMap<Function, Set<WeakRef<Type[]>>>();
const INFO = new WeakMap<Type[], Live>();
const WATCHED = new WeakSet<Type>();

function lists(type: Function) {
  let set = LISTS.get(type);

  if (!set)
    LISTS.set(type, set = new Set());

  return set;
}

function each(type: Function, fn: (live: Live) => void) {
  const set = LISTS.get(type);

  if (set)
    for (const ref of set) {
      const proxy = ref.deref();

      if (proxy)
        fn(INFO.get(proxy)!);
      else
        set.delete(ref);
    }
}

function watch(entity: Type) {
  if (WATCHED.has(entity))
    return;

  WATCHED.add(entity);
  listener(entity, () => drop(entity), null);
}

function drop(entity: Type) {
  each(entity.constructor, ({ items, proxy }) => {
    const index = items.indexOf(entity);

    if (index >= 0) {
      items.splice(index, 1);
      event(proxy, SHAPE);
    }
  });
}

function test(filter: Type.Constraint[], row: Row) {
  return filter.every(([column, op, value]) => {
    if (op == "asc" || op == "desc")
      return true;

    const isNull = NULL[op];

    return isNull ? isNull(row[column]) : match(op, row[column], value);
  });
}

function live<T extends Type>(type: Function, items: T[], filter?: Type.Constraint[]): T[] {
  const proxy = new Proxy(items, {
    get(target, key, receiver) {
      if (key != "length" && (typeof key != "string" || !/^\d+$/.test(key)))
        return Reflect.get(target, key, receiver);

      const value = Reflect.get(target, key);

      touch(receiver, SHAPE);

      return value ? touch(receiver, key, value) : value;
    }
  });

  event(proxy);
  items.forEach(watch);
  INFO.set(proxy, { items, proxy, filter });
  lists(type).add(new WeakRef(proxy));

  return proxy;
}

function listening(type: Function) {
  let found = false;

  each(type, ({ filter }) => found ||= !!filter);

  return found;
}

async function offer(type: Function, row: Row, resolve: () => Promise<[Type]>) {
  const into: Live[] = [];

  each(type, live => {
    if (live.filter && test(live.filter, row))
      into.push(live);
  });

  if (!into.length)
    return;

  const [entity] = await resolve();

  watch(entity);

  for (const { items, proxy } of into)
    if (!items.includes(entity)) {
      items.unshift(entity);
      event(proxy, SHAPE);
    }
}

export { live, listening, offer };
