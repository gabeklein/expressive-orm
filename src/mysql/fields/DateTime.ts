import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace DateTime {
  interface Options extends Field.Options {
    default?: "NOW" | Date;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function DateTime<T>(options: DateTime.Optional): Date | null | undefined;
function DateTime(options?: DateTime.Options): Date;
function DateTime(options?: DateTime.Options){
  return Column({
    ...options,
    datatype: 'DATETIME',
    get(dt: string){
      return new Date(dt.replace(/[-]/g, '/'))
    },
    set(date: Date){
      return date.toISOString().slice(0, 19).replace("T", " ");
    }
  });
}

export default DateTime;