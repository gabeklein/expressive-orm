import Entity, { Query, Column } from '../src';

class Foo extends Entity {
  value = Column();
  color = Column();
}

class Bar extends Entity {
  value = Column();
  color = Column();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");

    where.delete(foo);
  });

  expect(query).toMatchSnapshot();
})

it("will include FROM statement where JOIN exists", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.delete(foo);
  });

  expect(query).toMatchSnapshot();
})

it("will delete from multiple", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.delete(foo, bar);
  });

  expect(query).toMatchSnapshot();
})