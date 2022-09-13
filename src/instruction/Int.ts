import Field from '../Field';

declare namespace Int {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Int(options: Int.Optional): number | null | undefined;
function Int(options?: Int.Options): number;
function Int(options?: Int.Options){
  return IntergerColumn.create(options);
}

function TinyInt(options: Int.Optional): number | null | undefined;
function TinyInt(options?: Int.Options): number;
function TinyInt(options?: Int.Options){
  return IntergerColumn.create({
    ...options, datatype: "TINYINT"
  });
}

function SmallInt(options: Int.Optional): number | null | undefined;
function SmallInt(options?: Int.Options): number;
function SmallInt(options?: Int.Options){
  return IntergerColumn.create({
    ...options, datatype: "SMALLINT"
  });
}

function BigInt(options: Int.Optional): bigint | null | undefined;
function BigInt(options?: Int.Options): bigint;
function BigInt(options?: Int.Options){
  return IntergerColumn.create({
    ...options, datatype: "BIGINT"
  });
}

class IntergerColumn extends Field {
  datatype = "INT";
  placeholder = Infinity;
}

export default Int;
export { Int, TinyInt, SmallInt, BigInt }