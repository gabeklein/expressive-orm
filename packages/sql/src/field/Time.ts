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
    accept: (value) => value instanceof Date,
    get(dt: string){
      return new global.Date(dt.replace(/[-]/g, '/') + "Z");
    },
    set(date: Date){
      return date.toISOString().slice(0, 19).replace("T", " ");
    }
  });
}

export { Time }