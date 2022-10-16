import * as t from '@expressive/estree';

import Schema from '../connection/Schema';
import { InstructionsUsed } from './entities';
import { idealCase, parseType } from './util';

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
  "timestamp": "DateTime",
  "datetime": "DateTime",
  "double": "Double",
  "float": "Float",
  "enum": "Enum",
  "varchar": "VarChar",
  "json": "Json",
  "set": "Set"
}

export function instruction(column: Schema.Column){
  let { dataType, isPrimary, name, type } = column;
  const key = isPrimary ? "id" : idealCase(name, true);
  const subtype = parseType(type)!;

  let fieldType = TYPES[dataType] || "Column";
  let collapse: string | undefined;
  const opts: t.object.Abstract = {};

  if(key !== name)
    opts.column = name;

  if(isPrimary){
    fieldType = "Primary";
    opts.datatype = dataType;
    collapse = "datatype";
  }

  else switch(dataType){
    case "char":
    case "varchar":
      collapse = "length";

      if(subtype && subtype !== "255")
        opts.length = Number(subtype);
    break;

    case "set":
    case "enum": {
      collapse = "values";

      const elements = subtype
        .split(",")
        .map(x => x.replace(/^'|'$/g, ""))
        .map(t.literal);

      opts.values = t.arrayExpression({ elements });
    }
  }

  InstructionsUsed.add(fieldType);

  return field(key, fieldType, opts, collapse);
}

export function field(
  property: string,
  instruction: string,
  arg?: t.object.Abstract | t.Expression | string | number,
  collapse?: string
){
  let argument: t.Expression | undefined;

  if(typeof arg !== "object" || arg === null)
    argument = t.literal(arg);

  else if(t.isNode(arg))
    argument = arg;

  else {
    const entries = Object.entries(arg);

    if(collapse && entries.length == 1){
      const [key, value] = entries[0];

      if(key == collapse)
        argument = t.expression(value);
    }
    else if(entries.length)
      argument = t.object(arg);
  }

  const expression = argument
    ? t.callExpression(instruction, argument)
    : t.callExpression(instruction);

  return t.classProperty(property, expression);
}