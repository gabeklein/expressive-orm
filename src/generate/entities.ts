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
    size?: number;
    nullable: boolean;
    primary?: boolean;
  }

  interface Table {
    name: string;
    schema: string;
    columns: Column[];
  }
}

export function generateEntities(
  ...from: Schema.Table[]){

  const used = [
    "Bool",
    "Int",
    "String",
    // "DateTime",
    // "Enum",
    // "Idk",
  ]

  const ast = t.program({
    sourceType: "module",
    body: [
      t.importDeclaration("../", [
        t.importSpecifier("Entity", "default"),
        ...used.map(x => t.importSpecifier(x))
      ]),
      ...from.map(generateClass)
    ]
  })

  let code = generate(ast);
  code = code.replace(/\export/g, "\n\export")

  return code;
}

function generateClass(from: Schema.Table){
  const name = idealCase(from.name);
  const fields = from.columns.map(generateProperty);

  if(from.name !== name)
    fields.unshift(
      t.classProperty("table",
        t.call("Table", 
          t.object({
            name: from.name,
            schema: from.schema
          })
        )
      )
    )

  return t.exportNamedDeclaration({
    specifiers: [],
    declaration: t.classDeclaration(name, "Entity", fields)
  })
}

function generateProperty(from: Schema.Column){
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
    
      if(from.size && from.size !== DEFAULT_LENGTH[type])
        opts.length = from.size;
      
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