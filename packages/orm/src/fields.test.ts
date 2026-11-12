import { describe, expect, expectTypeOf, it } from 'vitest';

import { bool, date, index, isLike, json, key, Memory, now, num, one, optional, orNull, Query, str, Type, unique, uuid } from '.';
import { Field } from './Field';

function connect(){
  return class Table extends Type {
    static connection = Memory.new();
  }
}

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

function caught(fn: () => unknown){
  try {
    fn();
  }
  catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

describe("str", () => {
  it("will accept a string", () => {
    expect(column(() => str()).set("hello")).toBe("hello");
  })

  it("will throw on a non-string", () => {
    expect(caught(() => column(() => str()).set(3))).toBe("Value must be a string.");
  })

  it("will throw if longer than length", () => {
    const field = column(() => str({ type: "varchar", length: 3 }));

    expect(field.set("abc")).toBe("abc");
    expect(caught(() => field.set("abcd"))).toBe("Value length 4 exceeds maximum of 3.");
  })

  it("will declare a portable type", () => {
    expect(column(() => str()).type).toBe("text");
    expect(column(() => str()).helper).toBe(str);

    const field = column(() => str({ type: "varchar", length: 40, collate: "C" }));

    expect([field.type, field.length]).toEqual(["varchar", 40]);
  })

  it("will reject datatypes not declared", () => {
    // @ts-expect-error
    column(() => str({ type: "blob" }));
  })

  it("will reject options of another column", () => {
    // @ts-expect-error
    column(() => str({ precision: 2 }));
  })
})

describe("uuid", () => {
  it("will be a string column", () => {
    const field = column(() => uuid());

    expect(field.helper).toBe(str);
    expect(field.kind).toBe(String);
  })
})

describe("modifiers", () => {
  it("will mark unique and index", () => {
    const field = column(() => str(unique, index));

    expect([field.unique, field.index]).toEqual([true, true]);
  })

  it("will name an index", () => {
    expect(column(() => str({ index: "by_value" })).index).toBe("by_value");
  })
})

describe("key", () => {
  function id(type: Type.Class){
    return type.fields.get("id")!;
  }

  it("will default to an incrementing integer", async () => {
    class User extends connect() {
      id = key();
      name = str();
    }

    const { primary, increment, kind } = id(User);
    const user = await User.insert({ name: "Gabe" });
    const value: number = user.id;

    expect({ primary, increment, kind, value }).toEqual({ primary: true, increment: true, kind: Number, value: 1 });
  })

  it("will rename its column", () => {
    class User extends connect() {
      id = key({ column: "user_id" });
    }

    expect(id(User).column).toBe("user_id");
  })

  it("will key by a string the insert supplies", async () => {
    class Image extends connect() {
      id = key({ type: "text", column: "name" });
      size = num();
    }

    const { increment, kind, column } = id(Image);
    const image = await Image.insert({ id: "a.png", size: 1 });
    const value: string = image.id;

    expect({ increment, kind, column, value }).toEqual({ increment: false, kind: String, column: "name", value: "a.png" });

    // @ts-expect-error
    await expect(Image.insert({ size: 1 })).rejects.toThrow("Missing required field: id");
  })

  it("will key by a number without increment", async () => {
    class Version extends connect() {
      id = key({ type: "numeric", precision: 4, increment: false });
    }

    const { increment, kind } = id(Version);
    const version = await Version.insert({ id: 7 });
    const value: number = version.id;

    expect({ increment, kind, value }).toEqual({ increment: false, kind: Number, value: 7 });
  })

  it("will generate a uuid v7", async () => {
    class Asset extends connect() {
      id = key({ type: "uuid" });
      file = str();
    }

    const before = Date.now();
    const { id: generated } = await Asset.insert({ file: "a" });
    const time = parseInt(generated.replace(/-/g, "").slice(0, 12), 16);

    expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(Date.now());
  })

  it("will keep a uuid supplied", async () => {
    class Asset extends connect() {
      id = key({ type: "uuid" });
      file = str();
    }

    const asset = await Asset.insert({ id: "given", file: "a" });

    await Asset.update(asset.id, { file: "b" });

    expect(await Asset.one({ id: asset.id })).toEqual({ id: "given", file: "b" });
  })
})

describe("num", () => {
  it("will accept a number", () => {
    expect(column(() => num()).set(3)).toBe(3);
  })

  it("will throw on a non-number", () => {
    const field = column(() => num());

    expect(caught(() => field.set("3"))).toBe("Got '3' but value must be a number.");
    expect(caught(() => field.set(NaN))).toBe("Got 'NaN' but value must be a number.");
  })

  it("will default to integer", () => {
    const field = column(() => num());

    expect(field.type).toBe("integer");
    expect(caught(() => field.set(12.5))).toBe("Value 12.5 out of range for integer.");
    expect(caught(() => field.set(2 ** 31))).toBe("Value 2147483648 out of range for integer.");
  })

  it("will check integer ranges", () => {
    const small = column(() => num({ type: "smallint" }));
    const big = column(() => num({ type: "bigint" }));

    expect(small.set(32767)).toBe(32767);
    expect(caught(() => small.set(32768))).toBe("Value 32768 out of range for smallint.");
    expect(big.set(2 ** 40)).toBe(2 ** 40);
    expect(caught(() => big.set(1.5))).toBe("Value 1.5 out of range for bigint.");
  })

  it("will accept fractions as real or double", () => {
    expect(column(() => num({ type: "real" })).set(1.5)).toBe(1.5);
    expect(column(() => num({ type: "double" })).set(1.5)).toBe(1.5);
  })

  it("will check decimal precision and scale", () => {
    const field = column(() => num({ type: "decimal", precision: 5, scale: 2 }));
    const whole = column(() => num({ type: "numeric", precision: 3 } as const));

    expect(field.set(123.45)).toBe(123.45);
    expect(caught(() => field.set(12345.6))).toBe("Value 12345.6 exceeds precision of 5.");
    expect(caught(() => field.set(1.234))).toBe("Value 1.234 exceeds scale of 2.");
    expect(whole.set(1.5)).toBe(1.5);
  })
})

describe("bool", () => {
  it("will keep a boolean", () => {
    const field = column(() => bool());

    expect(field.set(true)).toBe(true);
    expect(field.set(false)).toBe(false);
    expect(field.type).toBe("boolean");
  })

  it("will reject storage options", () => {
    // @ts-expect-error
    column(() => bool({ either: ["YES", "NO"] }));
  })

  it("will throw on a non-boolean", () => {
    expect(caught(() => column(() => bool()).set(1))).toBe("Value must be a boolean.");
  })

  it("will pass null through", () => {
    expect(column(() => bool(orNull)).set(null)).toBeNull();
  })

})

describe("date", () => {
  it("will normalise to a Date", () => {
    const field = column(() => date());
    const iso = "2024-01-01T00:00:00.000Z";
    const given = new Date(iso);

    expect(field.set(given)).toEqual(given);
    expect(field.set(given)).not.toBe(given);
    expect(field.set(iso)).toEqual(given);
    expect(field.set(0)).toBeUndefined();
    expect(field.set(Date.parse(iso))).toEqual(given);
  })

  it("will read a Date from a string", () => {
    const field = column(() => date());
    const given = new Date("2024-01-01T00:00:00.000Z");

    expect(field.get(given)).toBe(given);
    expect(field.get(given.toISOString())).toEqual(given);
    expect(field.get(null)).toBeUndefined();
  })

  it("will throw on a non-date", () => {
    const field = column(() => date());

    expect(caught(() => field.set("nope"))).toBe("Got 'nope' but value must be a Date or date string.");
    expect(caught(() => field.set(true))).toBe("Got 'true' but value must be a Date or date string.");
  })

  it("will write a calendar day as its local date", () => {
    const field = column(() => date({ type: "date" }));
    const day = new Date(2026, 0, 2);

    expect(field.set("2026-01-02")).toBe("2026-01-02");
    expect(field.set(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
    expect(field.set(day.getTime())).toBe("2026-01-02");
    expect(field.set(new Date(999, 0, 2))).toBe("0999-01-02");
  })

  it("will read a calendar day as local midnight", () => {
    const field = column(() => date({ type: "date" }));
    const day = new Date(2026, 0, 2);

    expect(field.get("2026-01-02")).toEqual(day);
    expect(field.get("2026-01-02T00:00:00")).toEqual(day);
    expect(field.get(day)).toBe(day);
  })

  it("will keep a calendar day through memory", async () => {
    class Event extends connect() {
      day = date({ type: "date" });
    }

    const day = new Date(2026, 0, 2);
    const event = await Event.new({ day: new Date(2026, 0, 2, 23, 30) });

    expect(event.day).toEqual(day);
    expect(await Event.connection.select("event", [])).toEqual([{ id: 1, day: "2026-01-02" }]);
    expect(await Event.query({ day: "2026-01-02" })).toEqual([{ id: 1, day }]);

    await event.set({ day: "2026-01-03" });

    expect(event.day).toEqual(new Date(2026, 0, 3));
  })

  it("will default to timestamp", () => {
    expect(column(() => date()).type).toBe("timestamp");
    expect(column(() => date({ type: "time", timezone: true })).type).toBe("time");
  })

  it("will type options by datatype", () => {
    column(() => date({ timezone: true }));
    column(() => date({ type: "timestamp", timezone: true }));

    // @ts-expect-error
    column(() => date({ type: "date", timezone: true }));
  })
})

describe("json", () => {
  it("will keep a plain value", () => {
    const field = column(() => json());

    expect(field.set({ a: 1 })).toEqual({ a: 1 });
    expect(field.set(undefined)).toBeNull();
    expect(field.get(null)).toBeUndefined();
  })

  it("will match text by pattern", async () => {
    class Image extends connect() {
      loras = json<{ file: string }[]>(null);
    }

    await Image.insert({ loras: [{ file: "a.ckpt" }] });
    await Image.insert({ loras: [{ file: "b.ckpt" }] });

    const found = await Image.query({ loras: isLike('%"a.ckpt"%') });

    expect(found.map(image => image.loras)).toEqual([[{ file: "a.ckpt" }]]);
  })

  it("will be a plain field", () => {
    const field = column(() => json());

    expect(field.constructor).toBe(Field);
    expect(field.kind).toBe(Object);
    expect([field.type, field.helper]).toEqual(["json", json]);
  })
})

describe("and", () => {
  it("will preset options", () => {
    const email = str.and({ type: "varchar", length: 255 }, unique);
    const field = column(() => email(index));

    expect([field.type, field.length, field.unique, field.index]).toEqual(["varchar", 255, true, true]);
    expect(field.helper).toBe(str);
    expect(email.base).toBe(str);
  })

  it("will let options given override presets", () => {
    const short = str.and({ type: "varchar", length: 8 });

    expect(column(() => short({ length: 16 })).length).toBe(16);
  })

  it("will chain presets", () => {
    const money = num.and({ type: "decimal", precision: 10, scale: 2 });
    const owed = money.and(null);
    const field = column(() => owed({ column: "owed_amount" }));

    const { precision, scale } = field as Field & { precision?: number, scale?: number };

    expect([field.type, precision, scale, field.nullable, field.column]).toEqual(["decimal", 10, 2, true, "owed_amount"]);
    expect(owed.base).toBe(num);
  })

  it("will preset every helper", () => {
    class User extends connect() {}

    const flag = bool.and({ fallback: false });
    const day = date.and({ type: "date" });
    const blob = json.and({ column: "data" });
    const owner = one.and(null, { onDelete: "CASCADE" });

    expect(column(() => flag()).fallback).toBe(false);
    expect(column(() => day()).type).toBe("date");
    expect(column(() => blob()).column).toBe("data");

    const field = column(() => owner(User)) as Field & { onDelete?: string };

    expect([field.nullable, field.onDelete, field.helper]).toEqual([true, "CASCADE", one]);
  })

  it("will rebuild created and updated", () => {
    const created = column(() => date.created());
    const updated = column(() => date.updated());

    expect([created.fallback, created.fixed, created.helper]).toEqual([now, true, date]);
    expect([updated.fallback, updated.update, updated.helper]).toEqual([now, now, date]);
    expect(date.created.base).toBe(date);
  })

  it("will type by presets and options", () => {
    const maybe = str.and(null);
    const later = str.and(optional);
    const fixed = date.and({ fallback: now, fixed: true } as const);
    const owner = one.and(null);

    class Owner extends connect() {}

    class Tag extends connect() {
      a = str();
      b = str(null);
      c = maybe();
      d = str(optional);
      e = later();
      f = date({ fallback: now, fixed: true } as const);
      g = fixed();
      h = date.created();
      i = date.updated(null);
      j = owner(Owner);
      k = one(Owner, null);
      l = one(Owner);
    }

    const tag = {} as Tag;

    expectTypeOf(tag.a).toEqualTypeOf<string>();
    expectTypeOf(tag.b).toEqualTypeOf<string | undefined>();
    expectTypeOf(tag.c).toEqualTypeOf<typeof tag.b>();
    expectTypeOf(tag.e).toEqualTypeOf<typeof tag.d>();
    expectTypeOf(tag.g).toEqualTypeOf<typeof tag.f>();
    expectTypeOf(tag.h).toEqualTypeOf<typeof tag.f>();
    expectTypeOf(tag.i).toEqualTypeOf<Date | undefined>();
    expectTypeOf(tag.j).toEqualTypeOf<Owner | undefined>();
    expectTypeOf(tag.j).toEqualTypeOf<typeof tag.k>();
    expectTypeOf(tag.l).toEqualTypeOf<Owner>();

    const insert: Type.Insert<Tag> = { a: "a", l: 1 };

    // @ts-expect-error
    const missing: Type.Insert<Tag> = { l: 1 };

    // @ts-expect-error
    const update: Type.Update<Tag> = { h: new Date() };

    expect([insert, missing, update]).toBeTruthy();
  })
})

describe("insert types", () => {
  class Post extends connect() {
    title = str();
    slug = str({ fallback: "untitled" });
    views = num({ increment: true });
    code = str({ primary: true });
    note = str(optional);
    body = str(orNull);
  }

  it("will omit optional keys", async () => {
    const post = await Post.insert({ title: "Hello", views: 1, slug: "hello", code: "a" });

    const title: string = post.title;
    const slug: string = post.slug;
    const views: number = post.views;

    expect([title, slug, views]).toEqual(["Hello", "hello", 1]);

    // @ts-expect-error
    await expect(Post.insert({})).rejects.toThrow("Missing required field: title");
  })

  it("will omit optional keys in a query", () => {
    const query = Query(where => void where(Post, { title: "Hello" }));

    expect(String(query)).toMatchInlineSnapshot(`
      "insert post
        title: "Hello""
    `);

    // @ts-expect-error
    expect(() => Query(where => void where(Post, {}))).toThrow("A value is required");
  })

  it("will keep nullable reads optional", () => {
    const post = {} as Post;
    const body: string | undefined = post.body;

    // @ts-expect-error
    const strict: string = post.body;

    expect([body, strict]).toEqual([undefined, undefined]);
  })
})
