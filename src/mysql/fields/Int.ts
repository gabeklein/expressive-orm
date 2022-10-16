import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Int {
  interface Options extends Field.Options {
    size?: "tiny" | "small" | "big";
  }

  type Nullable = Options & { nullable: true };
}

function Int(options: Int.Nullable): number | null | undefined;
function Int(options?: Int.Options): number;
function Int(options: Int.Options = {}){
  const { size = "" } = options;
  const datatype = `${size.toUpperCase()}INT`;

  return Column({ datatype, ...options });
}

function TinyInt(options: Int.Nullable): number | null | undefined;
function TinyInt(options?: Int.Options): number;
function TinyInt(options?: Int.Options){
  return Int({ ...options, size: "tiny" });
}

function SmallInt(options: Int.Nullable): number | null | undefined;
function SmallInt(options?: Int.Options): number;
function SmallInt(options?: Int.Options){
  return Int({ ...options, size: "small" });
}

function BigInt(options: Int.Nullable): number | null | undefined;
function BigInt(options?: Int.Options): number;
function BigInt(options?: Int.Options){
  return Int({ ...options, size: "big" });
}

export default Int;
export { Int, TinyInt, SmallInt, BigInt }