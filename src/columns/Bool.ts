import Query from "../query/Query";
import Field, { TYPE, WHERE } from "./Field";

declare namespace Bool {
  type Value = boolean & TypeDef;
  type Optional = Value | undefined | null;

  interface TypeDef {
    [TYPE]?: BooleanColumn;
    [WHERE]?: Where;
  }

  interface Options {
    name?: string;
    nullable?: boolean;
  }

  interface Nullable extends Options {
    nullable: true;
  }

  export interface Where {
    /** Select rows where this column is equal to value. */
    is(value: boolean): void;

    /** Select rows where this column is not equal to value. */
    isNot(value: boolean): void;
  }
}

function Bool(): Bool.Value;
function Bool(options: Bool.Nullable): Bool.Optional;
function Bool(options: Bool.Options): Bool.Value;
function Bool(options: Bool.Options = {}){
  return BooleanColumn.create(options);
}

class BooleanColumn extends Field {
  use(key: string, query: Query<any>): Bool.Where {
    return {
      is(value: boolean){
        query.where(key, "=", value);
      },
      isNot(value: boolean){
        query.where(key, "<>", value);
      }
    }
  };
}

export default Bool;