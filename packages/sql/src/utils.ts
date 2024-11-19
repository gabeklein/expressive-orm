export function capitalize(string: string){
  return string[0].toUpperCase() + string.slice(1);
}

export function isIterable(obj: unknown): obj is Iterable<unknown> {
  type MaybeIterable = {
    [Symbol.iterator]?: () => IterableIterator<unknown>;
  };

  return obj != null && typeof (obj as MaybeIterable)[Symbol.iterator] === 'function';
}

export function underscore(str: string){
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}