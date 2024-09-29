import { Field } from '../Field';

declare namespace Json {
  interface OrNull<T extends {}> extends Json<T> {
    nullable: true;
  }
}

interface Json<T extends {}> extends Field {
  datatype: "json";
  get(value: string): T;
  set(value: T): string;
}

function Json<T extends {}>(a1: Json.OrNull<T>): T | null | undefined;
function Json<T extends {}>(a1?: Json<T>): T;
function Json(a1?: Json<any>){
  return Field({
    ...a1,
    datatype: "json",
    get(value: string){
      return JSON.parse(value);
    },
    set(value: {}){
      return JSON.stringify(value);
    }
  });
}

export { Json }