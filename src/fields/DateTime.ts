import Field from '../Field';

declare namespace DateTime {
  interface Options<T> {
    column?: string;
    default?: "NOW" | Date;
    nullable?: boolean;
  }

  interface Optional<T> extends Options<T> {
    nullable?: true;
  }
}

function DateTime<T>(options: DateTime.Optional<T>): Date | null | undefined;
function DateTime<T>(options?: DateTime.Options<T>): Date;
function DateTime<T>(options?: DateTime.Options<T>){
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