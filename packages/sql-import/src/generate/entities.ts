import * as t from '@expressive/estree';
import { generate } from 'astring';

import { Schema } from './Schema';
import { field } from './syntax';

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
  const explicit = name === identifier ? undefined : name;
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

export function idealCase(
  from: string, lowercase?: boolean) {

  const items = from
    .split(/[_-]/g)
    .map(segment => {
      if(!segment.match(/[a-z]/) || !segment.match(/[A-Z]/)){
        const head = segment[0];
        const tail = segment.slice(1);

        if(head)
          return (head.toUpperCase() + tail.toLowerCase());
      }

      return segment;
    });

  const joined = items.join("");

  return lowercase
    ? joined[0].toLowerCase() + joined.slice(1)
    : joined;
}