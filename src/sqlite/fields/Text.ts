import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Text {
  interface Options extends Field.Options {}
  interface Nullable extends Options { nullable: true }
}

function Text(options: Text.Nullable): string | null | undefined;
function Text(options?: Text.Options): string;
function Text(options: Text.Options = {}){
  return Column({
    datatype: "TEXT",
    ...options
  });
}

export { Text }