import { Column } from '..';

declare namespace Json {
  interface Options<T> extends Column.Options {}

  
  type Nullable<T> = Options<T> & { nullable: true };
}

function Json<T extends {}>(a1: Json.Nullable<T>): T | null | undefined;
function Json<T extends {}>(a1?: Json.Options<T>): T;
function Json(a1?: Json.Options<any>){
  return Column({
    ...a1,
    datatype: "JSON",
    get(value: string){
      return JSON.parse(value);
    },
    set(value: {}){
      return JSON.stringify(value);
    }
  });
}

export { Json };