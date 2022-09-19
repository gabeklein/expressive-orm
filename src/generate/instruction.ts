import * as t from '@expressive/estree';

import Schema from '../connection/Schema';
import { InstructionsUsed } from './entities';
import { idealCase, isEmpty, parseType } from './util';

const TYPES: any = {
  "blob": "Nope",
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
  "varbinary": "VarBinary",
  "timestamp": "DateTime",
  "datetime": "DateTime",
  "double": "Double",
  "float": "Float",
  "enum": "Enum",
  "varchar": "VarChar",
  "json": "Json",
  "set": "Flags"
}

export function instruction(column: Schema.Column){
  const { dataType, isPrimary, name, type } = column;
  const key = isPrimary ? "id" : idealCase(name, true);
  const subtype = parseType(type)!;

  let fieldType = TYPES[dataType] || "Nope";
  let opts: t.object.Abstract | t.Expression.Array | string | number = {};

  if(key !== name)
    opts.column = name;

  if(isPrimary){
    fieldType = "Primary";

    if(isEmpty(opts))
      opts = dataType
    else
      opts.datatype = dataType;
  }

  else switch(dataType){
    case "char":
    case "varchar":
      if(subtype && subtype !== "255")
        if(isEmpty(opts))
          opts = Number(subtype);
        else
          opts.length = Number(subtype);
    break;

    case "set":
    case "enum": {
      const elements = subtype
        .split(",")
        .map(x => x.replace(/^'|'$/g, ""))
        .map(t.literal);

      const values = t.arrayExpression({ elements });

      if(isEmpty(opts))
        opts = values;
      else
        opts.values = values;
    }
  }

  const argument =
    typeof opts != "object" ?
      t.literal(opts) :
    t.isNode(opts) ?
      opts :
    isEmpty(opts) ?
      undefined :
      t.object(opts, true);

  const instruction = argument
    ? t.callExpression(fieldType, argument)
    : t.callExpression(fieldType);

  InstructionsUsed.add(fieldType);

  return t.classProperty(key, instruction);
}