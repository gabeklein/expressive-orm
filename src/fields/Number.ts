import { Column } from '..';

declare namespace Int {
  interface Options extends Column.Options {
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

declare namespace Float {
  interface Options extends Column.Options {
    double?: boolean;
  }

  type Nullable = Options & { nullable: true };
}

function Float(options: Float.Nullable): number | null | undefined;
function Float(options?: Float.Options): number;
function Float(options: Float.Options = {}){
  const { double, ...rest } = options;

  return Column({
    datatype: double ? "DOUBLE" : "FLOAT",
    placeholder: Infinity,
    ...rest
  });
}

export {
  Float,
  Int
}