import * as t from '@expressive/estree';
import { generate } from 'astring';

import Schema from '../connection/Schema';
import { instruction } from './instruction';
import { imports, tableField } from './syntax';
import { idealCase } from './util';

export function generateEntities(
  from: { [name: string]: Schema.Table },
  explicitSchema?: boolean){

  const used = [
    "BigInt",
    "Binary",
    "Bool",
    "Char",
    "DateTime",
    "Double",
    "Enum",
    "Float",
    "Int",
    "LongText",
    "MediumText",
    "Primary",
    "Table",
    "Text",
    "TinyInt",
    "VarChar",
  ];

  const body: t.Statement[] = [
    imports(used)
  ];

  Object.values(from).forEach(table => {
    body.push(
      entity(table, explicitSchema)
    );
  })

  const code = generate(t.program(body));

  return code.replace(/\export/g, "\n\export");
}

function entity(
  from: Schema.Table,
  explicitSchema?: boolean){

  const name = idealCase(from.name);
  const fields: t.Class.Property[] = [];

  if(from.name !== name)
    fields.push(
      tableField(
        from.name,
        explicitSchema && from.schema
      )
    );
  
  Object.values(from.columns).forEach(field => {
    const key = idealCase(field.name, true);
    const value = instruction(field, key);

    fields.push(t.classProperty(key, value));
  })

  return t.exportNamedDeclaration({
    specifiers: [],
    declaration:
      t.classDeclaration(name, "Entity", fields)
  })
}