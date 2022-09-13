import Field from '../Field';

namespace Text {
  export interface Options {
    size?: "tiny" | "medium" | "long"
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
  }

  export interface Optional extends Options {
    nullable: true;
  }
}

function Text(column?: string): string;
function Text(column: string, options: Text.Optional): string | null | undefined;
function Text(column: string, options: Text.Options): string;
function Text(options: Text.Optional): string | null | undefined;
function Text(options: Text.Options): string;
function Text(
  arg1: string | Text.Options = {},
  arg2?: Text.Options): any {

  if(typeof arg1 == "string")
    arg1 = { ...arg2, column: arg1 };

  return TextColumn.create({
    datatype: `${arg1.size}text`,
    ...arg1
  });
}

class TextColumn extends Field {
  placeholder = `__${this.property}__`;
}

export default Text;