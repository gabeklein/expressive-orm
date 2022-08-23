import Query from '../Query';
import { qualify } from '../utility';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace Bool {
  type Value = boolean & MetaData;
  type Nullable = Value | undefined | null;

  interface MetaData {
    [TYPE]?: BooleanColumn;
    [WHERE]?: Where;
    [SELECT]?: boolean;
  }

  interface Options {
    column?: string;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }

  export interface Where {
    /** Select rows where this column is equal to value. */
    is(value: boolean): void;

    /** Select rows where this column is not equal to value. */
    isNot(value: boolean): void;
  }
}

function Bool(): Bool.Value;
function Bool(options: Bool.Optional): Bool.Nullable;
function Bool(options: Bool.Options): Bool.Value;
function Bool(options: Bool.Options = {}){
  return BooleanColumn.create(options);
}

class BooleanColumn extends Field {
  datatype = "TINYINT";

  where(query: Query<any>, parent?: string){
    const key = qualify(parent, this.column);
    const compare = (op: string) => (value: boolean) => {
      return query.compare(key, value ? 1 : 0, op);
    }

    return {
      is: compare("="),
      isNot: compare("<>"),
    }
  };
}

export default Bool;