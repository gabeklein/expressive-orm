import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Text {
  interface Options extends Field.Options {
    size?: "tiny" | "medium" | "long";
  }

  type Nullable = Options & { nullable: true };
}

function Text(options: Text.Nullable): string | null | undefined;
function Text(options?: Text.Options): string;
function Text(options: Text.Options = {}){
  const { size = "" } = options;

  const datatype = `${size.toUpperCase()}TEXT`;

  return Column({ datatype, ...options });
}

function TinyText(options: Text.Nullable): string | null | undefined;
function TinyText(options?: Text.Options): string;
function TinyText(opts: Text.Options = {}){
  return Text({ ...opts, size: "tiny" });
}

function MediumText(options: Text.Nullable): string | null | undefined;
function MediumText(options?: Text.Options): string;
function MediumText(opts: Text.Options = {}){
  return Text({ ...opts, size: "medium" });
}

function LongText(options: Text.Nullable): string | null | undefined;
function LongText(options?: Text.Options): string;
function LongText(opts: Text.Options = {}){
  return Text({ ...opts, size: "long" });
}

export default Text;
export { Text, TinyText, MediumText, LongText }