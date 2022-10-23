import Column from './Column';

declare namespace Boolean {
  interface Options extends Column.Options {
    either?: readonly [string, string];
  }

  type Nullable = Options & { nullable: true };
}

function Boolean(): boolean;
function Boolean(options: Boolean.Nullable): boolean | null | undefined;
function Boolean(options: Boolean.Options): boolean;
function Boolean(options: Boolean.Options = {}){
  let isTrue: any = 1;
  let isFalse: any = 0;
  let datatype = "TINYINT";

  if(options.either){
    [isTrue, isFalse] = options.either;

    datatype = `VARCHAR(${
      Math.max(isTrue.length, isFalse.length)
    })`
  }

  return Column({
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

export default Boolean;