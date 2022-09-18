import Field from '../Field';

declare namespace Int {
  interface Options {
    size?: "tiny" | "small" | "big";
    column?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable: true;
  }
}

function Int(options: Int.Optional): number | null | undefined;
function Int(options?: Int.Options): number;
function Int(options: Int.Options = {}){
  const { size = "" } = options;
  const datatype = `${size.toUpperCase()}INT`;

  return IntColumn.create({ datatype, ...options });
}

function TinyInt(options: Int.Optional): number | null | undefined;
function TinyInt(options?: Int.Options): number;
function TinyInt(options?: Int.Options){
  return Int({ ...options, size: "tiny" });
}

function SmallInt(options: Int.Optional): number | null | undefined;
function SmallInt(options?: Int.Options): number;
function SmallInt(options?: Int.Options){
  return Int({ ...options, size: "small" });
}

function BigInt(options: Int.Optional): number | null | undefined;
function BigInt(options?: Int.Options): number;
function BigInt(options?: Int.Options){
  return Int({ ...options, size: "big" });
}

class IntColumn extends Field {
  datatype = "INT";
  placeholder = Infinity;
}

export default Int;
export { Int, TinyInt, SmallInt, BigInt }