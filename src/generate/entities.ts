import * as t from '@expressive/estree';
import { generate } from 'astring';

import Schema from '../connection/Schema';
import { instruction } from './instruction';
import { idealCase } from './util';

export function generateEntities(schema: Schema){
  const { connection, name, tables } = schema;
  const explicitSchema = connection.database !== name;

  const used = [
    "BigInt",
    "Binary",
    "Bool",
    "Char",
    "DateTime",
    "Double",
    "Enum",
    "Flags",
    "Float",
    "Int",
    "Json",
    "LongText",
    "MediumText",
    "Primary",
    "Table",
    "Text",
    "TinyInt",
    "VarBinary",
    "VarChar"
  ];

  const body: t.Statement[] = [
    t.importDeclaration("../", [
      t.importSpecifier("Entity", "default"),
      ...used.map(x => t.importSpecifier(x))
    ])
  ];

  Object.values(tables).forEach(table => {
    body.push(
      entity(table, explicitSchema)
    );
  })

  const code = generate(t.program(body));

  return code.replace(/\export/g, "\n\export");
}

function entity(
  table: Schema.Table,
  explicitSchema?: boolean){

  const { name } = table;
  const identifier = idealCase(name);
  const tableName = name !== identifier ? name : undefined;
  const schema = explicitSchema ? table.schema : undefined;
  const fields: t.Class.Property[] = [];

  if(tableName || schema)
    fields.push(
      t.classProperty("table",
        t.callExpression("Table", schema
          ? t.object({ schema, name: tableName }, true)
          : t.literal(tableName)
        )
      )
    );

  Object.values(table.columns).forEach(column => {
    const key =
      column.isPrimary ? "id" :
      idealCase(column.name, true);

    const value = instruction(column, key);

    fields.push(t.classProperty(key, value));
  })

  return t.exportNamedDeclaration({
    specifiers: [],
    declaration:
      t.classDeclaration(identifier, "Entity", fields)
  })
}