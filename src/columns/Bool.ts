import Query from "../query/Query";
import Field, { TYPE } from "./Field";

declare namespace Bool {
  type Value = boolean & TypeDef;
  type Optional = Value | undefined | null;

  interface TypeDef {
    [TYPE]?: BooleanColumn;
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
function Bool(options?: Bool.Options): any {
  return BooleanColumn.create();
}

class BooleanColumn extends Field {
  assert(key: string, query: Query<any>): Bool.Where {
    return {
      is(value: boolean){
        query.where.add([key, "=", value]);
      },
      isNot(value: boolean){
        query.where.add([key, "<>", value]);
      }
    }
  };
}

export default Bool;