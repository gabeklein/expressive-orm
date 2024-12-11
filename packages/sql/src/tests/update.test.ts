import { Query, Str, Type } from '../';

class Foo extends Type {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).equal("red");
    where(foo).update({
      value: "new!",
      color: "blue"
    })
  });

  expect(query).toMatchInlineSnapshot(`
    UPDATE
      foo
    SET
      value = 'new!',
      color = 'blue'
    WHERE
      foo.color = 'red'
  `);
})

it.todo('will update multiple tables')