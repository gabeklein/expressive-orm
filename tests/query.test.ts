// import { format } from 'sql-formatter';
import { Entity, Int, String } from '../src';
import Query from '../src/Query';

// expect.addSnapshotSerializer({
//   test(){
//     return true;
//   },
//   print(stuff){
//     if(typeof stuff === "string")
//       return "    " + stuff.replace(/\n/g, "\n    ");
//     else
//       throw null;
//   },
//   serialize(stuff){
//     if(typeof stuff === "string")
//       return stuff.replace(/^    /g, "");
//     else
//       throw null;
//   }
// })

class Foo extends Entity {
  name = String();
  color = String();
}

class Bar extends Entity {
  name = String();
  color = String();
  rating = Int();
}

class Baz extends Entity {
  rating = Int();
}

it("will join using single query syntax", async () => {
  const query = new Query(where => {
    const foo = where.from(Foo);
    const bar = where.joins(Bar);
    const baz = where.joins(Baz, "left");

    where.equal(bar.color, foo.color);
    where.equal(baz.rating, bar.rating);

    where.notEqual(foo.name, "Danny");
    where.greater(bar.rating, 50);

    return () => ({
      foo: foo.name,
      bar: bar.name
    })
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`S1\`,
  \`Bar\`.\`name\` AS \`S2\`
FROM \`Foo\`
INNER JOIN \`Bar\`
  ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
LEFT JOIN \`Baz\`
  ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
WHERE
  \`Foo\`.\`name\` <> 'Danny' AND
  \`Bar\`.\`rating\` > 50
`);
})
