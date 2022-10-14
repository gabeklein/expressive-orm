import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Real {
  interface Options extends Field.Options {}

  interface Optional extends Options {
    nullable: true;
  }
}

function Real(options: Real.Optional): number | null | undefined;
function Real(options?: Real.Options): number;
function Real(options: Real.Options = {}){
  return Column({
    datatype: "REAL",
    ...options
  });
}

export { Real }