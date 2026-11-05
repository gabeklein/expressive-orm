const sql = {
  text: { type: "text" },
  uuid: { type: "uuid" },
  integer: { type: "integer" },
  smallint: { type: "smallint" },
  bigint: { type: "bigint" },
  real: { type: "real" },
  float: { type: "float" },
  double: { type: "double" },
  boolean: { type: "boolean" },
  timestamp: { type: "timestamp" },
  date: { type: "date" },
  time: { type: "time" },
  millis: { type: "millis" },
  varchar: <N extends number>(length: N) => ({ type: "varchar", length }) as const,
  char: <N extends number>(length: N) => ({ type: "char", length }) as const,
  numeric: (precision: number, scale = 0) => ({ type: "numeric", precision, scale }) as const,
  decimal: (precision: number, scale = 0) => ({ type: "decimal", precision, scale }) as const
} as const;

export { sql };
