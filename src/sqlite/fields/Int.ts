import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Int {
  interface Options extends Field.Options {}

  interface Optional extends Options {
    nullable: true;
  }
}

function Int(options: Int.Optional): number | null | undefined;
function Int(options?: Int.Options): number;
function Int(options: Int.Options = {}){
  return Column({
    datatype: "INTERGER",
    ...options
  });
}

export { Int }