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
  const fieldType = TYPES[from.type] || "Unknown";
  const opts = {} as {
    [key: string]: t.Expression | string | number | undefined
  };

  if(key !== from.name)
    opts.column = from.name;

  switch(from.type){
    case "varchar":
      let maxLength: t.Literal | undefined;

      if(from.maxLength! !== 255)
        maxLength = t.literal(from.maxLength!);

      if(maxLength)
        if(Object.keys(opts).length == 1)
          return t.call(fieldType, maxLength);
        else
          opts.length = maxLength;
    break;

    case "enum":
      opts.values = t.arrayExpression({
        elements: from.values!.map(x => t.literal(x))
      })
    break;
  }

  return (
    t.call(fieldType, t.object(opts, true))
  )
}