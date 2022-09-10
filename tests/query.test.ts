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
  const query = new Query($ => {
    const foo = $.from(Foo);
    const bar = $.join(Bar);
    const baz = $.join(Baz, "left");

    bar.color.is(foo.color);
    baz.rating.is(bar.rating);

    foo.name.isNot("Danny");
    bar.rating.isMore(50);

    return () => ({
      foo: foo.name,
      bar: bar.name
    })
  });

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
    SELECT
    	\`Foo\`.\`name\` as $1,
    	\`Bar\`.\`name\` as $2
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
