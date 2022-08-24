import Query from '../Query';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace Int {
  type Value = number & MetaData;
  type Nullable = Value | undefined | null;

  interface MetaData {
    [TYPE]?: IntergerColumn;
    [WHERE]?: Field.Where<number>;
    [SELECT]?: number;
  }

  interface Options {
    column?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Int(): Int.Value;
function Int(options: Int.Optional): Int.Nullable;
function Int(options: Int.Options): Int.Value;
function Int(options: Int.Options = {}){
  return IntergerColumn.create(options);
}

class IntergerColumn extends Field {
  datatype = "INT";
  placeholder = Infinity;

  where!: (query: Query<any>, parent?: string) => Field.Where<number>;
  select!: (query: Query<any>, path: string[], prefix?: string) => number;
}

export default Int;