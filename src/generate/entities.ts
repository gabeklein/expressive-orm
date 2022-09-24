import * as t from '@expressive/estree';
import { generate } from 'astring';

import Schema from '../connection/Schema';
import { field, instruction } from './instruction';
import { idealCase } from './util';

export const InstructionsUsed = new Set<string>();

export function generateEntities(schema: Schema){
  const { connection, name, tables } = schema;
  const specifySchema = connection.database !== name;

  const body: t.Statement[] = [];
  const imports: t.Import.Item[] = [
    t.importDefaultSpecifier("Entity")
  ]

  Object.values(tables).forEach(table => {
    body.push(
      t.exportNamedDeclaration(
        entityClass(table, specifySchema)
      )
    );
  })

  InstructionsUsed.forEach(name => {
    imports.push(
      t.importSpecifier(name)
    );
  })

  InstructionsUsed.clear();

  const ast = t.program([
    t.importDeclaration("../", imports),
    ...body
  ]);

  const code = generate(ast);

  return code.replace(/\export/g, "\n\export");
}

function entityClass(
  table: Schema.Table,
  explicitSchema?: boolean){

  const { name } = table;
  const properties: t.Class.Property[] = [];
  const identifier = idealCase(name);
  const explicit = name !== identifier ? name : undefined;
  const schema = explicitSchema ? table.schema : undefined;

  if(explicit || schema){
    const argumnet = schema
      ? { schema, name: explicit }
      : explicit

    const instruction = field("table", "Table", argumnet);
      
    InstructionsUsed.add("Table");
    properties.push(instruction);
  }

  Object.values(table.columns).forEach(column => {
    properties.push(instruction(column));
  })

  return t.classDeclaration(identifier, "Entity", properties);
}