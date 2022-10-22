import Column from './Column';

declare namespace Bool {
  interface Options extends Column.Options {
    either?: readonly [string, string];
  }

  type Nullable = Options & { nullable: true };
}

function Bool(): boolean;
function Bool(options: Bool.Nullable): boolean | null | undefined;
function Bool(options: Bool.Options): boolean;
function Bool(options: Bool.Options = {}){
  let isTrue: any = 1;
  let isFalse: any = 0;
  let datatype = "TINYINT";

  if(options.either){
    [isTrue, isFalse] = options.either;

    datatype = `VARCHAR(${
      Math.max(isTrue.length, isFalse.length)
    })`
  }

  return Column<boolean>({
    ...options,
    datatype,
    placeholder: true,
    get(value: any){
      return value === isTrue;
    },
    set(value: boolean){
      return value ? isTrue : isFalse;
    }
  });
}

export { Bool };