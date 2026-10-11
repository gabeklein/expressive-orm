import { date } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace date {
    interface Timestamp extends TimeColumn {
      type: "timestamp";
      precision?: number;
      timezone?: boolean;
    }

    interface Day extends TimeColumn {
      type: "date";
    }

    interface Time extends TimeColumn {
      type: "time";
      precision?: number;
      timezone?: boolean;
    }

    interface Interval extends TimeColumn {
      type: "interval";
      fields?: string;
      precision?: number;
    }

    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      date: Day;
      time: Time;
      interval: Interval;
    }
  }
}

class TimeColumn extends date.Type {
  type: date.DataType = "timestamp";
  timezone?: boolean;
  fields?: string;

  get datatype() {
    const { type, precision, timezone, fields } = this;
    let datatype: string = type;

    if (timezone && type.startsWith("time"))
      datatype += "tz";

    if (precision !== undefined && ["timestamp", "time", "interval"].includes(type))
      datatype += ` (${precision})`;

    if (fields && type === "interval")
      datatype += ` ${fields}`;

    return datatype;
  }

  get(value: unknown) {
    if (value instanceof Date && this.type === "timestamp" && !this.timezone)
      return new Date(value.getTime() - value.getTimezoneOffset() * 60000);

    if (typeof value == "string" && this.type === "date") {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    if (typeof value == "string" && this.type === "time")
      return new Date(`1970-01-01T${value}Z`);

    return super.get(value);
  }

  set(value: unknown) {
    const iso = super.set(value);

    if (iso === undefined)
      return iso;

    const text = new Date(iso).toISOString();

    if (this.type === "date")
      return text.slice(0, 10);

    if (this.type === "time")
      return text.slice(11, 19);

    if (this.timezone)
      return text;

    return text.slice(0, 19).replace("T", " ");
  }
}

date.Type = TimeColumn;
