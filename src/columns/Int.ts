import Field, { TYPE, basicAssertions } from "./Field";

declare namespace Int {
  type Value = number & TypeDef;
  type Optional = Value | undefined | null;

  interface TypeDef {
    [TYPE]?: IntergerColumn;
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
function Int(options?: Int.Options): any {
  return IntergerColumn.create();
}

class IntergerColumn extends Field {
  assert = basicAssertions;
}

export default Int;