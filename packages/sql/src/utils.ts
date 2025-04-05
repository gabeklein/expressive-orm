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

function escape(value: any){
  if(typeof value != "string")
    return value;

  const escaped = value
    .replace(/[\0\n\r\b\t\\'"\x1a]/g, s => (
      s == "\0" ? "\\0" :
      s == "\n" ? "\\n" :
      s == "\r" ? "\\r" :
      s == "\b" ? "\\b" :
      s == "\t" ? "\\t" :
      s == "\x1a" ? "\\Z" :
      "\\" + s
    ))
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ch => (
      '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')
    ))

  return `'${escaped}'`;
}

const {
  assign,
  create,
  defineProperty,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
  values,
} = Object;

export {
  assign,
  create,
  defineProperty,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
  values,
  escape
}