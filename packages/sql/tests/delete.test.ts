import { Query, Str, Type } from '../src';

class Foo extends Type {
  value = Str();
  color = Str();
}

class Bar extends Type {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");
    where(foo).delete();
  });

  expect(query).toMatchSnapshot();
})

it("will include FROM statement where JOIN exists", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");
    where(foo).delete();
  });

  expect(query).toMatchSnapshot();
})

// this is only suprted in MySQL
// it.skip("will delete from multiple", () => {
//   const query = new Query(where => {
//     const foo = where(Foo);
//     const bar = where(Bar, { color: foo.color });

//     where(bar.value).is("Hello World!");

//     where.delete(foo, bar);
//   });

//   expect(query).toMatchSnapshot();
// })