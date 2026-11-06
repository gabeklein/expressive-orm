import { date, str } from '@expressive/orm';
import { StringColumn as SQLStringColumn, TimeColumn as SQLTimeColumn } from '@expressive/sql';

function keyed(field: SQLStringColumn){
  const { primary, unique, index, parent } = field;

  return !!(primary || unique || index || parent?.fields.get("id")?.parts?.includes(field));
}

export class StringColumn extends SQLStringColumn {
  get datatype() {
    const { type, length, collate } = this;

    if (type === "uuid")
      return "char(36)";

    let datatype: string = type === "text" && keyed(this) ? "varchar(255)" : type;

    if (type.endsWith("char") && length)
      datatype += `(${length})`;

    if (collate)
      datatype += ` COLLATE ${collate}`;

    return datatype;
  }
}

export class TimeColumn extends SQLTimeColumn {
  get datatype() {
    const { type, precision } = this;

    if (type === "timestamp")
      return `datetime(${precision ?? 3})`;

    if (type === "time" && precision !== undefined)
      return `time(${precision})`;

    return super.datatype;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (typeof out != "string" || this.type !== "timestamp")
      return out;

    return out.slice(0, 23).replace("T", " ");
  }
}

str.Type = StringColumn;
date.Type = TimeColumn;
