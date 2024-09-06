import { Field } from './Field';

declare namespace Bool {
  interface Options extends Field.Options {
    either?: readonly [string, string];
  }

  type Nullable = Options & { nullable: true };
}

function Bool(): boolean;
function Bool(column: string, nullable: true): string | null | undefined;
function Bool(column: string, nullable?: boolean): string;
function Bool(options: Bool.Nullable): boolean | null | undefined;
function Bool(options: Bool.Options): boolean;
function Bool(options: Bool.Options | string = {}, nullable?: boolean){
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

export { Bool }