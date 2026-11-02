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

    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      date: Day;
      time: Time;
      integer: Integer;
      text: Text;
    }
  }
}

export class TimeColumn extends date.Type {
  type: date.DataType = "timestamp";

  get(value: unknown) {
    if (value == null)
      return undefined;

    if (typeof value === 'number')
      return new Date(value * 1000);

    if (typeof value === 'string' && this.type === "date") {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    if (typeof value === 'string' && this.type === "time")
      return new Date(`1970-01-01T${value}Z`);

    return new Date(value as string | Date);
  }

  set(value: unknown) {
    const iso = super.set(value);

    if (iso === undefined)
      return iso;

    const date = new Date(iso);

    if (this.type === "integer")
      return Math.floor(date.getTime() / 1000);

    if (this.type === "date")
      return date.toISOString().slice(0, 10);

    if (this.type === "time")
      return date.toISOString().slice(11, 19);

    return iso;
  }
}

date.Type = TimeColumn;
