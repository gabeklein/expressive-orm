import * as t from '@expressive/estree';
import { Schema } from './entities';

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

export function instruction(from: Schema.Column, key: string){
  let fieldType = TYPES[from.type] || "Unknown";
  const opts = {} as {
    [key: string]: t.Expression | string | number | undefined
  };

  if(key !== from.name)
    opts.column = from.name;

  if(from.primary){
    opts.datatype = from.type;
    fieldType = "Primary";

    if(inside(opts) == 1 && from.type)
      return t.call(fieldType, t.literal(from.type))
  }

  switch(from.type){
    case "varchar":
      let maxLength: t.Literal | undefined;

      if(from.maxLength! !== 255)
        maxLength = t.literal(from.maxLength!);

      if(maxLength)
        if(inside(opts) == 1)
          return t.call(fieldType, maxLength);
        else
          opts.length = maxLength;
    break;

    case "enum": {
      const values = t.arrayExpression({
        elements: from.values!.map(x => t.literal(x))
      })

      if(inside(opts) == 0)
        return t.call(fieldType, values)
      
      opts.values = values;
    } break;
  }

  return (
    t.call(fieldType, t.object(opts, true))
  )
}

const inside = (inside: {}) => Object.keys(inside).length;