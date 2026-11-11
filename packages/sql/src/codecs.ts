import { bool, date, json, num, str, type Connection, type Field } from '@expressive/orm';

type Codec = Connection.Codec;

type Sized = Field & { precision?: number, scale?: number, collate?: string };

const text: Codec = {
  types: ["text", "varchar", "char", "uuid"],
  datatype({ type, length, collate }: Sized){
    let datatype = type;

    if (type.endsWith("char") && length)
      datatype += `(${length})`;

    if (collate)
      datatype += ` COLLATE "${collate}"`;

    return datatype;
  },
  encode: (_field, value) => value,
  decode: (_field, value) => value
};

const number: Codec = {
  types: ["integer", "smallint", "bigint", "real", "double", "numeric", "decimal"],
  datatype({ type, precision, scale }: Sized){
    if (type === "double")
      return "double precision";

    if (precision !== undefined)
      return type + (scale === undefined ? `(${precision})` : `(${precision},${scale})`);

    return type;
  },
  encode: (_field, value) => value,
  decode: (_field, value) => typeof value == "number" ? value : parseFloat(value as string)
};

const boolean: Codec = {
  types: ["boolean"],
  datatype: () => "boolean",
  encode: (_field, value) => value,
  decode: (_field, value) => value === true || value === 1
};

const time: Codec = {
  types: ["timestamp", "date", "time"],
  datatype({ type, precision }: Sized){
    return precision === undefined ? type : `${type}(${precision})`;
  },
  encode({ type }, value){
    const date = value as Date;

    if (type === "date")
      return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(pad).join("-");

    const iso = date.toISOString();

    return type === "time" ? iso.slice(11, 19) : iso;
  },
  decode({ type }, value){
    if (typeof value === "string" && type === "date") {
      const [year, month, day] = value.slice(0, 10).split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    if (typeof value === "string" && type === "time")
      return new Date(`1970-01-01T${value}Z`);

    if (typeof value === "string" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?$/.test(value))
      return new Date(value.replace(" ", "T") + "Z");

    return new Date(value as string | Date);
  }
};

function pad(part: number, index: number){
  return String(part).padStart(index ? 2 : 4, "0");
}

const object: Codec = {
  types: ["json"],
  datatype: () => "text",
  encode: (_field, value) => JSON.stringify(value),
  decode(_field, value){
    try {
      return JSON.parse(value as string);
    }
    catch {
      return undefined;
    }
  }
};

/**
 * How SQL stores each field helper's values - keyed by the helper.
 *
 * `str` as text, `num` as its numeric type, `bool` as boolean, `json` as JSON text.
 * `date` as ISO 8601 text - a `timestamp` in UTC to the millisecond, a `date` as the local calendar day `YYYY-MM-DD` (read back as local midnight), a `time` as UTC `HH:MM:SS`.
 * A dialect replaces entries it stores differently.
 */
const codecs: ReadonlyMap<Function, Codec> = new Map<Function, Codec>([
  [str, text],
  [num, number],
  [bool, boolean],
  [date, time],
  [json, object]
]);

export { codecs };
