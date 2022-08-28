import * as astring from 'astring';

import t from './node';
import {
  call,
  classDeclaration,
  classProperty,
  importDeclaration,
  importSpecifier,
  object,
} from './abstract';

import type es from "estree";

const DEFAULT_LENGTH = {
  "varchar": 2 ** 8-1,
  "text": 2 ** 16-1,
  "mediumtext": 2 ** 24-1,
  "longtext": 2 ** 32-1
}

export declare namespace Schema {
  interface Column {
    name: string;
    table: string;
    type: string;
    size?: number;
    nullable: boolean;
    primary?: boolean;
  }

  interface Table {
    name: string;
    columns: Column[];
  }
}

export function generateEntities(
  ...from: Schema.Table[]){

  const ast = t.Program({
    sourceType: "module",
    body: [
      importDeclaration("../", [
        importSpecifier("Entity", "default"),
        importSpecifier("Bool"),
        importSpecifier("DateTime"),
        importSpecifier("Enum"),
        importSpecifier("Idk"),
        importSpecifier("Int"),
        importSpecifier("String"),
      ]),
      ...from.map(generateClass)
    ]
  })

  let code = astring.generate(ast);
  code = code.replace(/\export/g, "\n\export")

  return code;
}

function generateClass(from: Schema.Table){
  const name = idealCase(from.name);

  return t.ExportNamedDeclaration({
    specifiers: [],
    declaration: classDeclaration(name, "Entity", [
      ...from.columns.map(generateProperty)
    ])
  })
}

function generateProperty(from: Schema.Column){
  const property = idealCase(from.name, true);
  const opts = {} as { [key: string]: es.Expression | string | number };

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
    classProperty(property,
      call(fieldType, 
        object(opts, true)
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