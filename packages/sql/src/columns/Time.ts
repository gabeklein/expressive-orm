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

  set(value: string | Date, data: Field.Output){
    if(value === "NOW")
      value = "CURRENT_TIMESTAMP";

    else if(value instanceof Date)
      value = value.toISOString().slice(0, 19).replace("T", " ");

    else
      throw "Value must be a Date object."

    super.set(value, data);
  }
}

export { Time }