import * as t from '@expressive/estree';
import { generate } from 'astring';

import Schema from '../connection/Schema';
import { instruction } from './instruction';
import { idealCase } from './util';

export const InstructionsUsed = new Set<string>();

export function generateEntities(schema: Schema){
  const { connection, name, tables } = schema;
  const explicitSchema = connection.database !== name;

  const body: t.Statement[] = [];
  const imports: t.Import.Item[] = [
    t.importDefaultSpecifier("Entity")
  ]

  for(const table of Object.values(tables))
    body.push(
      t.exportNamedDeclaration(
        entityClass(table, explicitSchema)
      )
    );

  for(const i of InstructionsUsed)
    imports.push(t.importSpecifier(i));

  InstructionsUsed.clear();

  const code = generate(t.program([
    t.importDeclaration("../", imports),
    ...body
  ]));

  return code.replace(/\export/g, "\n\export");
}

function entityClass(
  table: Schema.Table,
  explicitSchema?: boolean){

  const { name } = table;
  const identifier = idealCase(name);
  const tableName = name !== identifier ? name : undefined;
  const schema = explicitSchema ? table.schema : undefined;
  const properties: t.Class.Property[] = [];

  if(tableName || schema){
    InstructionsUsed.add("Table");

    properties.push(
      t.classProperty("table",
        t.callExpression("Table", schema
          ? t.object({ schema, name: tableName }, true)
          : t.literal(tableName)
        )
      )
    );
  }

  Object.values(table.columns).forEach(column => {
    properties.push(instruction(column));
  })

  return t.classDeclaration(identifier, "Entity", properties)
}