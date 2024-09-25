import { Field } from './Field';

declare namespace Time {
  interface Options extends Field.Options {
    default?: "NOW" | Date;
  }

  type Nullable = Options & { nullable: true };
}

function Time(column: string, nullable: true): string | null | undefined;
function Time(column: string, nullable?: boolean): string;
function Time<T>(options: Time.Nullable): Date | null | undefined;
function Time(options?: Time.Options): Date;
function Time(options?: Time.Options | string, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  return Field.create({
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