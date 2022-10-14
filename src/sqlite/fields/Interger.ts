import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Interger {
  interface Options extends Field.Options {}
  interface Nullable extends Options { nullable: true }
}

function Interger(options: Interger.Nullable): number | null | undefined;
function Interger(options?: Interger.Options): number;
function Interger(options: Interger.Options = {}){
  return Column({ datatype: "TEXT", ...options });
}

export { Interger }