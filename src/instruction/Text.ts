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

function Text(options: Text.Optional): string | null | undefined;
function Text(options?: Text.Options): string;
function Text(arg1: Text.Options = {}): any {
  const datatype = `${arg1.size}text`;

  return TextColumn.create({
    datatype, ...arg1
  });
}

class TextColumn extends Field {
  placeholder = `__${this.property}__`;
}

export default Text;