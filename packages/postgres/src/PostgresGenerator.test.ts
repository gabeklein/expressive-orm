import { describe, expect, it } from 'vitest';

import { date, Type } from '@expressive/orm';

import './columns';
import { now } from './PostgresGenerator';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("now", () => {
  it("will match each date storage", () => {
    const utc = "(now() AT TIME ZONE 'UTC')";

    expect(now(column(() => date({ type: "ms" })))).toBe("(extract(epoch from now()) * 1000)::bigint");
    expect(now(column(() => date({ type: "seconds" })))).toBe("extract(epoch from now())::integer");
    expect(now(column(() => date({ type: "integer" })))).toBe("extract(epoch from now())::integer");
    expect(now(column(() => date({ type: "date" })))).toBe(`${utc}::date`);
    expect(now(column(() => date({ type: "time" })))).toBe(`${utc}::time`);
    expect(now(column(() => date({ type: "time", timezone: true })))).toBe("now()::timetz");
    expect(now(column(() => date({ type: "text" })))).toBe(`to_char(${utc}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
    expect(now(column(() => date({ type: "timestamp", timezone: true })))).toBe("now()");
    expect(now(column(() => date()))).toBe(utc);
    expect(now()).toBe(utc);
  })
})
