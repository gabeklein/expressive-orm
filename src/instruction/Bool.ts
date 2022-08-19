import Query from '../Query';
import { escape } from '../utility';
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
  datatype = "TINYINT";

  where(query: Query<any>, parent?: string){
    const key = escape(parent, this.column);
    const compare = (operator: string) =>
      (value: boolean) => {
        query.compare(key, value ? 1 : 0, operator);
      }

    return <Bool.Where>{
      is: compare("="),
      isNot: compare("<>"),
    }
  };
}

export default Bool;