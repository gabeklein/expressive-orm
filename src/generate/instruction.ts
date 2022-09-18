import * as t from '@expressive/estree';

import Schema from '../connection/Schema';
import { idealCase, isEmpty, parseType } from './util';

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

export function instruction(column: Schema.Column){
  const { dataType, isPrimary, name, type } = column;
  const key = isPrimary ? "id" : idealCase(name, true);
  const subtype = parseType(type);

  let fieldType = TYPES[dataType] || "Unknown";
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
    case "varchar": {
      const maxLength =
        subtype && subtype !== "255" && Number(subtype);

      if(maxLength)
        if(isEmpty(opts))
          opts = maxLength;
        else
          opts.length = maxLength;

      break;
    }

    case "set":
    case "enum": {
      const elements = subtype!
        .split(",")
        .map(x => t.literal(
          x.replace(/^'|'$/g, "")
        ))

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

  return t.classProperty(key,
    t.callExpression(fieldType, argument)  
  )
}