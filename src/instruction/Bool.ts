import Field, { SELECT, TYPE, WHERE } from '../Field';
import Query from '../Query';

declare namespace Bool {
  type Value = boolean & {
    [TYPE]?: BooleanColumn;
    [WHERE]?: Where;
    [SELECT]?: boolean;
  };

  type Nullable = Value | undefined | null;

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
  placeholder = true;

  get(value: 0 | 1){
    return !!value;
  }

  set(value: boolean){
    return value ? 1 : 0;
  }

  where(query: Query<any>){
    return {
      is: this.compare(query, "="),
      isNot: this.compare(query, "<>"),
    }
  };
}

export default Bool;