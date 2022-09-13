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
function Text(options: Text.Options = {}){
  const { size = "" } = options;

  const datatype = `${size.toUpperCase()}TEXT`;

  return TextColumn.create({ datatype, ...options });
}

function TinyText(options: Text.Optional): string | null | undefined;
function TinyText(options?: Text.Options): string;
function TinyText(opts: Text.Options = {}){
  return Text({ ...opts, size: "tiny" });
}

function MediumText(options: Text.Optional): string | null | undefined;
function MediumText(options?: Text.Options): string;
function MediumText(opts: Text.Options = {}){
  return Text({ ...opts, size: "medium" });
}

function LongText(options: Text.Optional): string | null | undefined;
function LongText(options?: Text.Options): string;
function LongText(opts: Text.Options = {}){
  return Text({ ...opts, size: "long" });
}

class TextColumn extends Field {
  placeholder = `__${this.property}__`;
}

export default Text;
export { Text, TinyText, MediumText, LongText }