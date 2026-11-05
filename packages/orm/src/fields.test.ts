import { describe, expect, it } from 'vitest';

import { bool, date, index, isLike, json, key, memory, num, one, optional, orNull, Query, str, Type, unique, uuid } from '.';
import { Field } from './Field';

class TextColumn extends str.Type {
  type: str.DataType = "text";
}

class IntegerColumn extends num.Type {
  type: num.DataType = "integer";
}

class TimeColumn extends date.Type {
  type: date.DataType = "timestamp";
}

declare module '@expressive/orm' {
  namespace str {
    interface Text extends TextColumn {
      type: "text";
    }

    interface VarChar extends TextColumn {
      type: "varchar";
      length: number;
    }

    interface UUID extends TextColumn {
      type: "uuid";
    }

    interface Types {
      default: Text;
      text: Text;
      varchar: VarChar;
      uuid: UUID;
    }
  }

  namespace num {
    interface Integer extends IntegerColumn {
      type: "integer";
    }

    interface Numeric extends IntegerColumn {
      type: "numeric";
      precision: number;
    }

    interface Types {
      default: Integer;
      integer: Integer;
      numeric: Numeric;
    }
  }

  namespace date {
    interface Timestamp extends TimeColumn {
      type: "timestamp";
      timezone?: boolean;
    }

    interface Day extends TimeColumn {
      type: "date";
    }

    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      date: Day;
    }
  }
}

function connect(){
  return class Table extends Type {
    static connection = memory();
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

  it("will compose datatype", () => {
    expect(column(() => str()).datatype).toBe("");
    expect(column(() => str({ length: 3 })).datatype).toBe("");
    expect(column(() => str({ type: "text" })).datatype).toBe("text");
    expect(column(() => str({ type: "varchar", length: 40 })).datatype).toBe("varchar(40)");
    expect(column(() => str({ type: "text", collate: "C" })).datatype).toBe('text COLLATE "C"');
  })

  it("will reject datatypes not augmented", () => {
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

    expect(field).toBeInstanceOf(str.Type);
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

    expect(await Asset.one(asset.id)).toEqual({ id: "given", file: "b" });
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

  it("will parse stored strings", () => {
    expect(column(() => num()).get("1.5")).toBe(1.5);
  })

  it("will compose datatype", () => {
    expect(column(() => num()).datatype).toBe("");
    expect(column(() => num({ type: "integer" })).datatype).toBe("integer");
    expect(column(() => num({ type: "numeric", precision: 10 })).datatype).toBe("numeric(10)");
    expect(column(() => num({ type: "numeric", precision: 10, scale: 2 })).datatype).toBe("numeric(10,2)");
  })
})

describe("bool", () => {
  it("will store as integer", () => {
    const field = column(() => bool());

    expect(field.set(true)).toBe(1);
    expect(field.set(false)).toBe(0);
    expect(field.get(1)).toBe(true);
    expect(field.get(0)).toBe(false);
  })

  it("will store with either", () => {
    const field = column(() => bool({ either: ["YES", "NO"] }));

    expect(field.set(true)).toBe("YES");
    expect(field.set(false)).toBe("NO");
    expect(field.get("YES")).toBe(true);
    expect(field.get("NO")).toBe(false);
    expect(field.get(true)).toBe(true);
  })

  it("will throw on a non-boolean", () => {
    expect(caught(() => column(() => bool()).set(1))).toBe("Value must be a boolean.");
  })

  it("will pass null through", () => {
    expect(column(() => bool(orNull)).set(null)).toBeNull();
  })

  it("will use type as datatype", () => {
    expect(column(() => bool()).datatype).toBe("");
  })
})

describe("date", () => {
  it("will store an ISO string", () => {
    const field = column(() => date());
    const iso = "2024-01-01T00:00:00.000Z";

    expect(field.set(new Date(iso))).toBe(iso);
    expect(field.set(iso)).toBe(iso);
    expect(field.set(0)).toBeUndefined();
    expect(field.set(Date.parse(iso))).toBe(iso);
  })

  it("will throw on a non-date", () => {
    const field = column(() => date());

    expect(caught(() => field.set("nope"))).toBe("Got 'nope' but value must be a Date or date string.");
    expect(caught(() => field.set(true))).toBe("Got 'true' but value must be a Date or date string.");
  })

  it("will compose datatype", () => {
    expect(column(() => date()).datatype).toBe("");
    expect(column(() => date({ type: "timestamp", precision: 3 })).datatype).toBe("timestamp(3)");
  })

  it("will type options by datatype", () => {
    column(() => date({ timezone: true }));
    column(() => date({ type: "timestamp", timezone: true }));

    // @ts-expect-error
    column(() => date({ type: "date", timezone: true }));
  })
})

describe("json", () => {
  it("will read malformed text as undefined", () => {
    const field = column(() => json());

    expect(field.get("{", {})).toBeUndefined();
    expect(field.get('{"a":1}', {})).toEqual({ a: 1 });
  })

  it("will match text by pattern", async () => {
    class Image extends connect() {
      loras = json<{ file: string }[]>(null);
    }

    await Image.insert({ loras: [{ file: "a.ckpt" }] });
    await Image.insert({ loras: [{ file: "b.ckpt" }] });

    const found = await Image.find({ loras: isLike('%"a.ckpt"%') });

    expect(found.map(image => image.loras)).toEqual([[{ file: "a.ckpt" }]]);
  })

  it("will be a plain field", () => {
    const field = column(() => json());

    expect(field.constructor).toBe(Field);
    expect(field.kind).toBe(Object);
    expect(field.datatype).toBe("text");
  })
})

describe("Type hook", () => {
  it("will construct fields from a replaced class", () => {
    const Base = str.Type;

    str.Type = TextColumn;

    try {
      const plain = column(() => str());
      const sized = column(() => str({ type: "varchar", length: 40, column: "label" }));

      expect(plain).toBeInstanceOf(TextColumn);
      expect(plain.datatype).toBe("text");
      expect(sized.datatype).toBe("varchar(40)");
      expect(sized.column).toBe("label");
    }
    finally {
      str.Type = Base;
    }

    expect(column(() => str())).not.toBeInstanceOf(TextColumn);
  })

  it("will replace each column class", () => {
    const Num = num.Type;
    const Time = date.Type;

    num.Type = IntegerColumn;
    date.Type = TimeColumn;

    try {
      expect(column(() => num()).datatype).toBe("integer");
      expect(column(() => date()).datatype).toBe("timestamp");
      expect(column(() => date({ type: "date" })).datatype).toBe("date");
    }
    finally {
      num.Type = Num;
      date.Type = Time;
    }
  })

  it("will replace the relation class", () => {
    class Foreign<T extends Type = Type> extends one.Type<T> {
      type: one.DataType = "integer";
    }

    class User extends connect() {}

    const Base = one.Type;

    one.Type = Foreign;

    try {
      const field = column(() => one(User, { onDelete: "cascade" }));

      expect(field).toBeInstanceOf(Foreign);
      expect(field.datatype).toBe("integer");
      expect(field.column).toBe("user_id");
    }
    finally {
      one.Type = Base;
    }
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
