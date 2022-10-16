import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Int {
  interface Options extends Field.Options {}

  type Nullable = Options & { nullable: true };
}

function Int(options: Int.Nullable): number | null | undefined;
function Int(options?: Int.Options): number;
function Int(options: Int.Options = {}){
  return Column({
    datatype: "INTERGER",
    ...options
  });
}

export { Int }