import Field from '../../Field';

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
  return DateTimeColumn.create({
    ...options, datatype: 'DATETIME'
  });
}

class DateTimeColumn extends Field {
  values = [] as any[];
  placeholder = "";

  get(dt: string){
    return new Date(dt.replace(/[-]/g, '/'))
  }

  set(date: Date){
    return date.toISOString().slice(0, 19).replace("T", " ");
  }
}

export default DateTime;