import { Bool, Connection, Type } from '..';

it("will insert and retrieve a tinyint", async () => {
  const conn = new Connection();

  class Test extends Type {
    value1 = Bool();
    value2 = Bool({
      type: "varchar",
      either: ["YES", "NO"]
    });
  }

  expect(conn.schema({ Test })).toMatchInlineSnapshot(`
    CREATE TABLE
      test (
        id INTEGER NOT NULL PRIMARY key autoincrement,
        value1 tinyint NOT NULL,
        value2 VARCHAR(3) NOT NULL
      )
  `);

  await conn.attach({ Test });

  const insert = Test.insert({
    value1: true, value2: true
  });

  expect(insert).toMatchInlineSnapshot(`
    INSERT INTO
      test (value1, value2)
    VALUES
      ('1', 'YES')
  `);
  
  await expect(insert).resolves.toBe(1);
  await expect(Test.one()).resolves.toEqual({
    id: 1, value1: true, value2: true
  });
});