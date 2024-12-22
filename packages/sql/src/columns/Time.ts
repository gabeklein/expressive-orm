import { Field } from '..';

interface Time extends Field<Date> {
  type: "datetime";
  fallback: "NOW" | Date | undefined;
}

function Time(options?: Partial<Time>){
  return Field<Time>(self => {
    const { set } = self;

    return {
      type: "datetime",
      ...options,
      get(value: string){
        return new global.Date(value.replace(/[-]/g, '/') + "Z");
      },
      set(value: string | Date){
        if(value === "NOW")
          value = "CURRENT_TIMESTAMP";
  
        else if(value instanceof Date)
          value = value.toISOString().slice(0, 19).replace("T", " ");
  
        else
          throw "Value must be a Date object."
  
        return set.call(self, value as any);
      }
    }
  });
}

export { Time }