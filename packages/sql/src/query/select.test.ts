import { Query, Str, Type } from '..';
import { TestConnection } from '../connection/TestConnection';

class Foo extends Type {
  bar = Str();
  baz = Str();
}

new TestConnection({ Foo }, async () => {
  await Foo.insert({ bar: "hello", baz: "world" });
});

describe("select", () => {
  it("will select via object", async () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
  
      return { bar, baz }
    })

    type Returns = Query.Selects<{
      bar: string;
      baz: string;
    }>
  
    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.bar AS bar,
        foo.baz AS baz
      FROM
        foo
    `);

    expect(await query).toEqual([
      { bar: "hello", baz: "world" }
    ]);
  })

  it("will output nested object", async () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
  
      return {
        bar: { value: bar },
        baz: { value: baz }
      }
    })

    type Returns = Query.Selects<{
      bar: { value: string };
      baz: { value: string };
    }>
  
    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.bar AS \`bar.value\`,
        foo.baz AS \`baz.value\`
      FROM
        foo
    `);

    expect(await query).toEqual([{ 
      bar: { value: "hello" }, 
      baz: { value: "world" }
    }]);
  })
  
  it("will select a field directly", () => {
    const query = Query(where => {
      return where(Foo).bar;
    })

    type Returns = Query.Selects<string>;
  
    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.bar
      FROM
        foo
    `);
  })
  
  it("will select a entire entity", () => {
    const query = Query(where => {
      return where(Foo);
    })

    type Returns = Query.Selects<{
      id: number;
      bar: string;
      baz: string;
    }>

    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.id AS id,
        foo.bar AS bar,
        foo.baz AS baz
      FROM
        foo
    `);
  })
})