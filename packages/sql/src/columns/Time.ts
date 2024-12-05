import { Field } from '../Field';

function Time(options?: Partial<DateTime>){
  return DateTime.new(options);
}

class DateTime extends Field<Date> {
  type = "datetime" as const;
  default = "NOW";

  get(value: string): Date {
    return new global.Date(value.replace(/[-]/g, '/') + "Z");
  }

  set(value: string | Date){
    if(value === "NOW")
      return "CURRENT_TIMESTAMP";

    if(value instanceof Date)
      return value.toISOString().slice(0, 19).replace("T", " ");

    throw "Value must be a Date object."
  }
}

export { Time }