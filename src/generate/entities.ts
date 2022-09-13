import * as t from '@expressive/estree';
import { generate } from 'astring';

const DEFAULT_LENGTH = {
  "varchar": 2 ** 8-1,
  "text": 2 ** 16-1,
  "mediumtext": 2 ** 24-1,
  "longtext": 2 ** 32-1
}

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
    column: string | null;
    name: string | null;
    deleteRule: string | null;
    updateRule: string | null;
  }
}

export function generateEntities(
  from: Map<string, Schema.Table>){

  const used = [
    "Bool",
    "Int",
    "String",
    // "DateTime",
    // "Enum",
    // "Idk",
  ];

  const tables: t.Export.Named[] = [];

  from.forEach(table => {
    tables.push(entityClass(table));
  })

  const ast = t.program({
    sourceType: "module",
    body: [
      imports(used),
      ...tables
    ]
  })

  return generate(ast).replace(/\export/g, "\n\export");
}

const imports = (named: string[]) => (
  t.importDeclaration("../", [
    t.importSpecifier("Entity", "default"),
    ...named.map(x => t.importSpecifier(x))
  ])
)

const entityClass = (from: Schema.Table) => {
  const name = idealCase(from.name);
  const fields: t.Class.Property[] = [];
  
  from.columns.forEach(field => {
    fields.push(fieldProperty(field));
  })

  if(from.name !== name)
    fields.unshift(tableProperty(from));

  return t.exportNamedDeclaration({
    specifiers: [],
    declaration:
      t.classDeclaration(name, "Entity", fields)
  })
}

const tableProperty = (from: Schema.Table) => (
  t.classProperty("table",
    t.call("Table", 
      t.object({
        name: from.name,
        schema: from.schema
      })
    )
  )
)

function fieldProperty(from: Schema.Column){
  const property = idealCase(from.name, true);
  const opts = {} as { [key: string]: t.Expression | string | number };

  let fieldType: "Int" | "String" | "Primary" | "Bool" | "Enum" | "DateTime";

  const { type } = from;

  if(property !== from.name)
    opts.column = from.name;

  switch(type){
    // case "json":
    case "longtext":
    case "mediumtext":
    case "text":
    case "varchar": {
      fieldType = "String";

      if(type !== "varchar")
        opts.type = type;
    
      if(from.maxLength && from.maxLength !== DEFAULT_LENGTH[type])
        opts.length = from.maxLength;
      
      break;
    };

    case "bigint":
    case "int": {
      fieldType = "Int"

      break;
    }

    case "tinyint": {
      fieldType = "Bool";

      break;
    }

    case "enum": {
      fieldType = "Enum";

      break;
    }

    case "datetime": {
      fieldType = "DateTime";

      break;
    }

    default:
      fieldType = "Idk" as any;
      // throw new Error("not supported");
  }

  return (
    t.classProperty(property,
      t.call(fieldType, 
        t.object(opts, true)
      )
    )
  )
}

function idealCase(
  from: string, lowercase?: boolean) {

  const items = from
    .split(/[_-]/g)
    .map(segment => {
      if(!segment.match(/[a-z]/) || !segment.match(/[A-Z]/))
        return (
          segment[0].toUpperCase() +
          segment.slice(1).toLowerCase()
        );

      return segment;
    });

  const joined = items.join("");

  return lowercase
    ? joined[0].toLowerCase() + joined.slice(1)
    : joined;
}