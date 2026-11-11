import { describe, expect, it } from 'vitest';

import { date, Type } from '@expressive/orm';

import { now } from './SQLiteGenerator';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("now", () => {
  it("will match each date storage", () => {
    expect(now(column(() => date({ type: "date" })))).toBe("date('now')");
    expect(now(column(() => date({ type: "time" })))).toBe("time('now')");
    expect(now(column(() => date()))).toBe("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    expect(now()).toBe("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  })
})
