import { date } from '@expressive/orm';
import { NumericColumn, TimeColumn as SQLTimeColumn } from '@expressive/sql';

declare module '@expressive/orm' {
  namespace num {
    interface Serial extends NumericColumn {
      type: "serial";
    }

    interface Types {
      serial: Serial;
    }
  }

  namespace date {
    interface Timestamp {
      timezone?: boolean;
    }

    interface Time {
      timezone?: boolean;
    }

    interface Interval extends TimeColumn {
      type: "interval";
      fields?: string;
    }

    interface Types {
      interval: Interval;
    }
  }
}

export class TimeColumn extends SQLTimeColumn {
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

    return super.get(value);
  }

  set(value: unknown) {
    const out = super.set(value);

    if (typeof out != "string" || this.type !== "timestamp" || this.timezone)
      return out;

    return out.slice(0, 19).replace("T", " ");
  }
}

date.Type = TimeColumn;
