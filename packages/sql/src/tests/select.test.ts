import { Query, Str, Type } from '../';
import { SelectQuery } from '../Query';

class Foo extends Type {
  bar = Str();
  baz = Str();
}

describe("select", () => {
  it("will select via object", () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
  
      return { bar, baz }
    })

    type Returns = SelectQuery<{
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
  })

  it.skip("will output nested object", () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
  
      return {
        bar: { value: bar },
        baz: { value: baz }
      }
    })

    type Returns = SelectQuery<{
      bar: { value: string };
      baz: { value: string };
    }>
  
    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.bar AS bar,
        foo.baz AS baz
      FROM
        foo
    `);
  })
  
  it("will select a field directly", () => {
    const query = Query(where => {
      const foo = where(Foo);
  
      return foo.bar;
    })

    type Returns = SelectQuery<string>;
  
    expect<Returns>(query).toMatchInlineSnapshot(`
      SELECT
        foo.bar AS bar
      FROM
        foo
    `);
  })
  
  it("will select a entire entity", () => {
    const query = Query(where => {
      return where(Foo);
    })

    type Returns = SelectQuery<{
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