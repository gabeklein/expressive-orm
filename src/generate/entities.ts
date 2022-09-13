import * as t from '@expressive/estree';
import { generate } from 'astring';

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
  }

  interface Table {
    name: string;
    schema: string;
    columns: Map<string, Column>;
  }

  interface Reference {
    table: string;
    column?: string;
    name?: string;
    deleteRule?: string;
    updateRule?: string;
  }
}

const TYPES: any = {
  "int": "Int",
  "tinyint": "TinyInt",
  "smallint": "SmallInt",
  "bigint": "BigInt",
  "text": "Text",
  "tinytext": "TinyText",
  "mediumtext": "MediumText",
  "longtext": "LongText",
  "char": "Char",
  "binary": "Binary",
  "timestamp": "DateTime",
  "double": "Double",
  "float": "Float",
  "enum": "Enum",
  "varchar": "VarChar"
}

export function generateEntities(
  from: Map<string, Schema.Table>,
  explicitSchema?: boolean){

  const used = [
    "Bool",
    "Int",
    "VarChar",
    // "DateTime",
    // "Enum",
    // "Idk",
  ];

  const body: t.Statement[] = [
    imports(used)
  ];

  from.forEach(table => {
    body.push(entityClass(table, explicitSchema));
  })

  const code = generate(t.program(body));

  return code.replace(/\export/g, "\n\export");
}

const imports = (named: string[]) => (
  t.importDeclaration("../", [
    t.importSpecifier("Entity", "default"),
    ...named.map(x => t.importSpecifier(x))
  ])
)

const entityClass = (
  from: Schema.Table,
  explicitSchema?: boolean) => {

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

const tableField = (
  name: string, schema?: string | false) => (

  t.classProperty("table",
    t.call("Table", schema
      ? t.object({ schema, name })
      : t.literal(name)
    )
  )
)

function instruction(from: Schema.Column, key: string){
  const fieldType = TYPES[from.type] || "Unknown";
  const opts = {} as {
    [key: string]: t.Expression | string | number | undefined
  };

  if(key !== from.name)
    opts.column = from.name;

  switch(from.type){
    case "varchar":
      if(from.maxLength !== 255)
        opts.length = from.maxLength;

      if(from.maxLength && Object.keys(opts).length == 1)
        return (
          t.call(fieldType, t.literal(from.maxLength))
        )
    break;
  }

  return (
    t.call(fieldType, t.object(opts, true))
  )
}

function idealCase(
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