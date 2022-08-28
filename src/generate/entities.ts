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
      importDeclaration("@expressive/orm", [
        importSpecifier("Entity", "default"),
        importSpecifier("String")
      ]),
      ...from.map(generateClass)
    ]
  })

  let code = astring.generate(ast);
  code = code.replace(/\nclass/g, "\n\nclass")

  console.log(code);
}

function generateClass(from: Schema.Table){
  const name = idealCase(from.name);

  return classDeclaration(name, "Entity", [
    ...from.columns.map(generateProperty)
  ])
}

function generateProperty(from: Schema.Column){
  const property = idealCase(from.name, true);
  const opts = {} as { [key: string]: es.Expression | string | number };

  let fieldType: "Int" | "String" | "Primary" | "Bool";

  if(property !== from.name)
    opts.column = from.name;

  switch(from.type){
    case "varchar": {
      fieldType = "String";
    
      if(from.size && from.size !== 255)
        opts.size = from.size;
      
      break;
    };

    case "int": {
      fieldType = "Int"

      break;
    }

    case "tinyint": {
      fieldType = "Bool";

      break;
    }

    default:
      throw new Error("not supported");
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
    .split(/_-/g)
    .map(segment => {
      return segment;
    });

  const joined = items.join("");

  return lowercase
    ? joined[0].toLowerCase() + joined.slice(1)
    : joined;
}