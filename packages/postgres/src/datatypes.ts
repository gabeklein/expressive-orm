import { sql as base } from '@expressive/sql';

const sql = {
  ...base,
  serial: { type: "serial" },
  interval: { type: "interval" },
  timestamptz: { type: "timestamp", timezone: true },
  timetz: { type: "time", timezone: true }
} as const;

export { sql };
