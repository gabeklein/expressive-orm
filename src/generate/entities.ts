import * as t from '@expressive/estree';
import { generate } from 'astring';
import { instruction } from './instruction';
import { imports, tableField } from './syntax';

import { idealCase } from './util';

export declare namespace Schema {
  interface Column {
    name: string;
    schema: string;
    table: string;
    type: string;
    maxLength?: number;
    nullable: boolean;
    primary?: boolean;
    reference?: Reference;
    values?: string[];
  }

  interface Table {
    name: string;
    schema: string;
    columns: Map<string, Column>;
  }

  interface Reference {
    table: string;
    column: string;
    name?: string;
    deleteRule?: string;
    updateRule?: string;
  }
}

export function generateEntities(
  from: Map<string, Schema.Table>,
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
    "Unknown",
    "VarChar",
  ];

  const body: t.Statement[] = [
    imports(used)
  ];

  from.forEach(table => {
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
  
  from.columns.forEach(field => {
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