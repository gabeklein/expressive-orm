import { Field } from '../type/Field';

class TimeColumn extends Field<Date> {
  readonly type: "datetime" = "datetime";
  readonly fallback?: "NOW" | Date = undefined;

  get(value: string) {
    return new global.Date(value.replace(/[-]/g, '/') + "Z");
  }

  set(value: string | Date) {
    if (value === "NOW")
      return "CURRENT_TIMESTAMP";
    else if (value instanceof Date)
      return value.toISOString().slice(0, 19).replace("T", " ");
    else
      throw "Value must be a Date or 'NOW'.";
  }
}

interface Time extends TimeColumn {}

function Time(options?: Partial<Time>): Time {
  return new TimeColumn(options);
}

Time.Type = TimeColumn;

export { Time };