import Field from '../Field';

declare namespace Json {
  interface Options<T> {
    column?: string;
    nullable?: boolean;
  }

  interface Optional<T> extends Options<T> {
    nullable?: true;
  }
}

function Json<T extends {}>(a1: Json.Optional<T>): T | null | undefined;
function Json<T extends {}>(a1?: Json.Options<T>): T;
function Json(a1?: Json.Options<any>){
  return JsonColumn.create({ ...a1, datatype: "JSON" });
}

class JsonColumn extends Field {
  variable = false;

  get(value: string){
    return JSON.parse(value);
  }

  set(value: {}){
    return JSON.stringify(value);
  }
}

export default Json;