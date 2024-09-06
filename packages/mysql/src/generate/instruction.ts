// import * as t from '@expressive/estree';

// import { Schema } from '../../connection/Schema';
// import { InstructionsUsed } from '../../generate/entities';
// import { field } from '../../generate/syntax';
// import { idealCase, parseType } from '../../generate/util';

// // TODO: deprecated types
// const TYPES: any = {
//   "int": "Int",
//   "tinyint": "TinyInt",
//   "smallint": "SmallInt",
//   "bigint": "BigInt",
//   "text": "Text",
//   "tinytext": "TinyText",
//   "mediumtext": "MediumText",
//   "longtext": "LongText",
//   "char": "Char",
//   "timestamp": "DateTime",
//   "datetime": "DateTime",
//   "double": "Double",
//   "float": "Float",
//   "enum": "Enum",
//   "varchar": "VarChar",
//   "json": "Json",
//   "set": "Set"
// }

// export function instruction(column: Schema.Column){
//   let { dataType, primary, name } = column;
//   const key = primary ? "id" : idealCase(name, true);
//   const subtype = parseType(type)!;

//   let fieldType = TYPES[dataType] || "Column";
//   let collapse: string | undefined;
//   const opts: t.object.Abstract = {};

//   if(key !== name)
//     opts.column = name;

//   if(primary){
//     fieldType = "Primary";
//     opts.datatype = dataType;
//     collapse = "datatype";
//   }

//   else switch(dataType){
//     case "char":
//     case "varchar":
//       collapse = "length";

//       if(subtype && subtype !== "255")
//         opts.length = Number(subtype);
//     break;

//     case "set":
//     case "enum": {
//       collapse = "values";

//       const elements = subtype
//         .split(",")
//         .map(x => x.replace(/^'|'$/g, ""))
//         .map(t.literal);

//       opts.values = t.arrayExpression({ elements });
//     }
//   }

//   InstructionsUsed.add(fieldType);

//   return field(key, fieldType, opts, collapse);
// }