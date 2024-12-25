import { Field } from '..';

interface Time extends Field<Date> {
  type: "datetime";
  fallback: "NOW" | Date | undefined;
}

function Time(options?: Partial<Time>){
  return Field<Time>({
    type: "datetime",
    ...options,
    get(value: string){
      return new global.Date(value.replace(/[-]/g, '/') + "Z");
    },
    set(value: string | Date){
      if(value === "NOW")
        return "CURRENT_TIMESTAMP";
      else if(value instanceof Date)
        return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
      else
        throw "Value must be a Date object."
    }
  });
}

export { Time }