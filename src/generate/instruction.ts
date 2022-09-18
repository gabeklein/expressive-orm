import * as t from '@expressive/estree';

import Schema from '../connection/Schema';

const parseType = (type: string) => {
  const extract = /^(\w+)(?:\((.+)\))?$/;
  const match = extract.exec(type);

  if(!match)
    throw new Error(`${type} is not a parsable SQL type.`)
  
  return {
    name: match[1],
    argument: match[2]
  }
} 

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
  const { dataType } = from;
  let fieldType = TYPES[dataType] || "Unknown";
  let opts: t.object.Abstract | t.Expression.Array | string | number = {};

  if(key !== from.name)
    opts.column = from.name;

  if(from.isPrimary){
    opts.datatype = dataType;
    fieldType = "Primary";

    if(inside(opts) == 1 && dataType)
      opts = dataType;
  }

  else switch(dataType){
    case "varchar": {
      let maxLength: number | undefined;
      const { argument } = parseType(dataType);

      if(argument !== "255")
        maxLength = Number(argument)

      if(maxLength)
        if(inside(opts) == 0)
          opts = maxLength;
        else
          opts.length = maxLength;

      break;
    }

    case "enum": {
      const { argument } = parseType(from.type);
      const elements = argument
        .split(",")
        .map(x => {
          const string = x.replace(/^'|'$/g, "");
          return t.literal(string);
        })

      const values = t.arrayExpression({ elements });

      if(inside(opts) == 0)
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

  return t.call(fieldType, argument);
}

const inside = (inside: {}) => Object.keys(inside).length;