import { date, type Connection, type Field } from '@expressive/orm';
import { codecs as sql } from '@expressive/sql';

type Time = Field & { precision?: number, timezone?: boolean };

const base = sql.get(date)!;

const time: Connection.Codec<Time> = {
  types: ["timestamp", "date", "time"],
  datatype({ type, precision, timezone }){
    let datatype: string = type;

    if (timezone && type !== "date")
      datatype += "tz";

    if (precision !== undefined && type !== "date")
      datatype += ` (${precision})`;

    return datatype;
  },
  encode(field, value){
    const out = base.encode(field, value) as string;

    return field.type === "timestamp" && !field.timezone ? out.slice(0, 23).replace("T", " ") : out;
  },
  decode(field, value){
    const { type, timezone } = field;

    if (type === "time" && timezone && typeof value == "string")
      return new Date(`1970-01-01T${value.replace(/([+-]\d\d)$/, "$1:00")}`);

    if (type === "timestamp" && !timezone)
      if (value instanceof Date)
        return new Date(value.getTime() - value.getTimezoneOffset() * 60000);
      else if (typeof value == "string")
        return base.decode(field, value.replace(" ", "T") + "Z");

    return base.decode(field, value);
  }
};

const codecs: ReadonlyMap<Function, Connection.Codec> = new Map([...sql, [date, time]]);

export { codecs };
