import { describe, expect, it } from 'vitest';

import { date, num, Type } from '@expressive/orm';

import { codecs } from './codecs';
import { sql } from './datatypes';

function datatype(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  const field = Test.fields.get("value")!;

  return codecs.get(field.helper!)!.datatype(field);
}

describe("sql", () => {
  it("will add Postgres datatypes", () => {
    expect(datatype(() => date(sql.timestamptz))).toBe("timestamptz");
    expect(datatype(() => date(sql.timetz))).toBe("timetz");
    expect(datatype(() => num(sql.bigint))).toBe("bigint");
  })
})
