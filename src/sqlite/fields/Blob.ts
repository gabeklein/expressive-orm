import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Blob {
  interface Options extends Field.Options {}

  interface Optional extends Options {
    nullable: true;
  }
}

function Blob(options: Blob.Optional): string | null | undefined;
function Blob(options?: Blob.Options): string;
function Blob(options: Blob.Options = {}){
  return Column({
    datatype: "BLOB",
    ...options
  });
}

export { Blob }