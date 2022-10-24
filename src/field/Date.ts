import Field from '../Field';

declare namespace Date {
  interface Options extends Field.Options {
    default?: "NOW" | Date;
  }

  type Nullable = Options & { nullable: true };
}

function Date(column: string, nullable: true): string | null | undefined;
function Date(column: string, nullable?: boolean): string;
function Date<T>(options: Date.Nullable): Date | null | undefined;
function Date(options?: Date.Options): Date;
function Date(options?: Date.Options | string, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  return Field.create({
    ...options,
    datatype: 'DATETIME',
    nullable,
    get(dt: string){
      return new global.Date(dt.replace(/[-]/g, '/') + "Z");
    },
    set(date: Date){
      return date.toISOString().slice(0, 19).replace("T", " ");
    }
  });
}

export default Date;