import { describe, expect, it } from 'vitest';

import { date, num, Type } from '@expressive/orm';

import { sql } from './datatypes';
import './columns';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("sql", () => {
  it("will add Postgres datatypes", () => {
    expect(column(() => num(sql.serial)).datatype).toBe("serial");
    expect(column(() => date(sql.timestamptz)).datatype).toBe("timestamptz");
    expect(column(() => date(sql.timetz)).datatype).toBe("timetz");
    expect(column(() => date(sql.interval)).datatype).toBe("interval");
    expect(column(() => date(sql.ms)).datatype).toBe("bigint");
    expect(column(() => date(sql.seconds)).datatype).toBe("integer");
    expect(column(() => num(sql.bigint)).datatype).toBe("bigint");
  })
})
