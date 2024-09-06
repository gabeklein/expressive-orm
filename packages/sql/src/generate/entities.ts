import * as t from '@expressive/estree';
import { generate } from 'astring';

import Schema from '../connection/Schema';
// import { instruction } from './instruction';
import { field } from './syntax';
import { idealCase } from './util';

export const InstructionsUsed = new Set<string>();

export function generateEntities(
  schema: Schema, specifySchema: boolean){

  const { tables } = schema;

  const body: t.Statement[] = [];
  const imports: t.Import.Item[] = [
    t.importDefaultSpecifier("Type")
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

  return generate(ast).replace(/export/g, "\nexport");
}

function entityClass(
  table: Schema.Table,
  specifySchema?: boolean){

  const { name } = table;
  const properties: t.Class.Property[] = [];
  const identifier = idealCase(name);
  const explicit = name !== identifier ? name : undefined;
  const schema = specifySchema ? table.schema : undefined;

  if(explicit || schema){
    const argument = schema
      ? { schema, name: explicit }
      : explicit

    const instruction = field("table", "Table", argument);
      
    InstructionsUsed.add("Table");
    properties.push(instruction);
  }

  // Object.values(table.columns).forEach(column => {
  //   properties.push(instruction(column));
  // })

  return t.classDeclaration(identifier, "Type", properties);
}