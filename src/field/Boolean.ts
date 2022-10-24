import Field from '../Field';

declare namespace Boolean {
  interface Options extends Field.Options {
    either?: readonly [string, string];
  }

  type Nullable = Options & { nullable: true };
}

function Boolean(): boolean;
function Boolean(column: string, nullable: true): string | null | undefined;
function Boolean(column: string, nullable?: boolean): string;
function Boolean(options: Boolean.Nullable): boolean | null | undefined;
function Boolean(options: Boolean.Options): boolean;
function Boolean(options: Boolean.Options | string = {}, nullable?: boolean){
  let isTrue: any = 1;
  let isFalse: any = 0;
  let datatype = "TINYINT";

  if(typeof options == "string")
    options = { column: options };

  if(options.either){
    [isTrue, isFalse] = options.either;

    datatype = `VARCHAR(${
      Math.max(isTrue.length, isFalse.length)
    })`
  }

  return Field.create({
    nullable,
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