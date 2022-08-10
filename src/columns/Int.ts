import Field, { TYPE, basicAssertions, WHERE } from "./Field";

declare namespace Int {
  type Value = number & TypeDef;
  type Optional = Value | undefined | null;

  interface TypeDef {
    [TYPE]?: IntergerColumn;
    [WHERE]?: Field.Where<number>;
  }

  interface Options {
    name?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
  }

  interface Nullable extends Options {
    nullable: true;
  }
}

function Int(): Int.Value;
function Int(options: Int.Nullable): Int.Optional;
function Int(options: Int.Options): Int.Value;
function Int(options: Int.Options = {}){
  return IntergerColumn.create(options);
}

class IntergerColumn extends Field {
  use = basicAssertions;
}

export default Int;