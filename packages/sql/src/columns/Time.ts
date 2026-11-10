import { date } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace date {
    interface Timestamp extends TimeColumn {
      type: "timestamp";
    }

    interface Day extends TimeColumn {
      type: "date";
    }

    interface Time extends TimeColumn {
      type: "time";
    }

    interface Integer extends TimeColumn {
      type: "integer";
    }

    interface Text extends TimeColumn {
      type: "text";
    }

    interface Ms extends TimeColumn {
      type: "ms";
    }

    interface Seconds extends TimeColumn {
      type: "seconds";
    }

    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      date: Day;
      time: Time;
      integer: Integer;
      text: Text;
      ms: Ms;
      seconds: Seconds;
    }
  }
}

/**
 * Column class behind `date()` on SQL.
 *
 * Stores a Date as `timestamp`, `date`, `time`, `ms`, `seconds`, `integer` or `text`.
 */
export class TimeColumn extends date.Type {
  type: date.DataType = "timestamp";

  get datatype() {
    const { type } = this;

    return type === "ms" ? "bigint" : type === "seconds" ? "integer" : super.datatype;
  }

  get(value: unknown) {
    if (value == null)
      return undefined;

    if (this.type === "ms")
      return new Date(Number(value));

    if (typeof value === 'number')
      return new Date(value * 1000);

    if (typeof value === 'string' && this.type === "date") {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    if (typeof value === 'string' && this.type === "time")
      return new Date(`1970-01-01T${value}Z`);

    if (typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?$/.test(value))
      return new Date(value.replace(" ", "T") + "Z");

    return new Date(value as string | Date);
  }

  set(value: unknown) {
    const iso = super.set(value);

    if (iso === undefined)
      return iso;

    const date = new Date(iso);

    if (this.type === "ms")
      return date.getTime();

    if (this.type === "integer" || this.type === "seconds")
      return Math.floor(date.getTime() / 1000);

    if (this.type === "date")
      return date.toISOString().slice(0, 10);

    if (this.type === "time")
      return date.toISOString().slice(11, 19);

    return iso;
  }
}

date.Type = TimeColumn;
