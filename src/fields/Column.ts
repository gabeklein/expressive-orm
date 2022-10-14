import Field from '../Field';

declare namespace Column {
  interface Options<T = any> {
    datatype?: string;
    column?: string;
    default?: any;
    nullable?: boolean;
    unique?: boolean;

    get?(value: any): T;
    set?(value: T): any;
  }
}

function Column<T = any>(
  options: Column.Options = {}): T {

  return Field.create(options);
}

export default Column;