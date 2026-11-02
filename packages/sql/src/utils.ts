export function escape(value: unknown){
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
