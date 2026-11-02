export function escape(value: unknown){
  return typeof value == "string"
    ? `'${value.replace(/'/g, "''")}'`
    : value;
}
