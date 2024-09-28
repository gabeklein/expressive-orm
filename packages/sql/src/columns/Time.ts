import { Field } from '../Field';

declare namespace Time {
  interface OrNull extends Time {
    nullable: true;
  }
}

interface Time extends Field {
  datatype?: "DATETIME";
  default?: "NOW";
  get?(value: string): Date;
  set?(value: Date): string;
}

function Time(column: string, nullable: true): string | null | undefined;
function Time(column: string, nullable?: boolean): string;
function Time<T>(options: Time.OrNull): Date | null | undefined;
function Time(options?: Time): Date;
function Time(options?: Time | string, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  return Field({
    ...options,
    datatype: 'DATETIME',
    nullable,
    get(value: string){
      return new global.Date(value.replace(/[-]/g, '/') + "Z");
    },
    set(value: unknown){
      // TODO: consider using typescript differing get/set types to accept string.
      if(!(value instanceof Date))
        throw "Value must be a Date object."

      return value.toISOString().slice(0, 19).replace("T", " ");
    }
  });
}

export { Time }