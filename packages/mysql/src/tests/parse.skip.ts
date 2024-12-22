import { Parser } from "@expressive/sql-import"

it("will parse sql schema", () => {
  const SQL = `
    USE TestDatabase;
    CREATE TABLE \`Table\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`value\` VARCHAR(255),
      PRIMARY KEY id_pk (\`id\`)
    );
  `
  
  const parser = new Parser(SQL);

  expect(parser.tables).toMatchObject({
    "Table": {
      "columns": {
        "id": {
          "dataType": "INT",
          "increment": true,
          "name": "id",
          "nullable": false,
        },
        "value": {
          "argument": [ 255 ],
          "dataType": "VARCHAR",
          "name": "value",
        },
      },
      "name": "Table",
      "primaryKeys": [ "id" ],
      "schema": "TestDatabase",
    },
  });
})