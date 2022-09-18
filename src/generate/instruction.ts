import * as t from '@expressive/estree';

import Schema from '../connection/Schema';
import { isEmpty, parseType } from './util';

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

export function instruction(from: Schema.Column, key: string){
  const { dataType } = from;
  let fieldType = TYPES[dataType] || "Unknown";
  let opts: t.object.Abstract | t.Expression.Array | string | number = {};

  if(key !== from.name)
    opts.column = from.name;

  if(from.isPrimary){
    fieldType = "Primary";

    if(isEmpty(opts))
      opts = dataType
    else
      opts.datatype = dataType;
  }

  else switch(dataType){
    case "char":
    case "varchar": {
      const argument = parseType(from.type);
      const maxLength = argument !== "255" && Number(argument);

      if(maxLength)
        if(isEmpty(opts))
          opts = maxLength;
        else
          opts.length = maxLength;

      break;
    }

    case "set":
    case "enum": {
      const argument = parseType(from.type);
      const elements = argument
        .split(",")
        .map(x => {
          const string = x.replace(/^'|'$/g, "");
          return t.literal(string);
        })

      const values = t.arrayExpression({ elements });

      if(isEmpty(opts))
        opts = values;
      else
        opts.values = values;

      break;
    }
  }

  const argument =
    typeof opts != "object" ?
      t.literal(opts) :
    t.isNode(opts) ?
      opts :
    t.object(opts, true);

  return t.callExpression(fieldType, argument);
}