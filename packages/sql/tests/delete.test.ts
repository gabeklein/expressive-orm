import { Entity, Query, Str } from '../src';

class Foo extends Entity {
  value = Str();
  color = Str();
}

class Bar extends Entity {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");

    where.deletes(foo);
  });

  expect(query).toMatchSnapshot();
})

it("will include FROM statement where JOIN exists", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.deletes(foo);
  });

  expect(query).toMatchSnapshot();
})

it("will delete from multiple", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.deletes(foo, bar);
  });

  expect(query).toMatchSnapshot();
})