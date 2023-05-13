import Entity, { Query, String } from '../src';

class Foo extends Entity {
  value = String();
  color = String();
}

class Bar extends Entity {
  value = String();
  color = String();
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