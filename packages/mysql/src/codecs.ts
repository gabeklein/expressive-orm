import { date, str, type Connection, type Field } from '@expressive/orm';
import { codecs as sql } from '@expressive/sql';

type Sized = Field & { precision?: number, collate?: string };

const base = {
  text: sql.get(str)!,
  time: sql.get(date)!
};

function keyed(field: Field){
  const { primary, unique, index, parent } = field;

  return !!(primary || unique || index || parent?.fields.get("id")?.parts?.includes(field));
}

const text: Connection.Codec<Sized> = {
  ...base.text,
  datatype(field){
    const { type, length, collate } = field;

    if (type === "uuid")
      return "char(36)";

    let datatype: string = type === "text" && keyed(field) ? "varchar(255)" : type;

    if (type.endsWith("char") && length)
      datatype += `(${length})`;

    if (collate)
      datatype += ` COLLATE ${collate}`;

    return datatype;
  }
};

const time: Connection.Codec<Sized> = {
  ...base.time,
  datatype({ type, precision }){
    if (type === "timestamp")
      return `datetime(${precision ?? 3})`;

    return precision === undefined || type === "date" ? type : `${type}(${precision})`;
  },
  encode(field, value){
    const out = base.time.encode(field, value);

    return field.type === "timestamp" ? (out as string).slice(0, 23).replace("T", " ") : out;
  }
};

const codecs: ReadonlyMap<Function, Connection.Codec> = new Map([...sql, [str, text], [date, time]]);

export { codecs };
