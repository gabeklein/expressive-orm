import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

declare namespace Bool {
  type Value = boolean & MetaData;
  type Optional = Value | undefined | null;

  interface MetaData {
    [TYPE]?: BooleanColumn;
    [WHERE]?: Where;
  }

  interface Options {
    column?: string;
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
  where(query: Query<any>, key: string){
    return <Bool.Where>{
      is(value: boolean){
        query.addWhere(key, "=", value);
      },
      isNot(value: boolean){
        query.addWhere(key, "<>", value);
      }
    }
  };
}

export default Bool;