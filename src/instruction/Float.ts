import Field from '../Field';

declare namespace Float {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
    double?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Float(options: Float.Optional): number | null | undefined;
function Float(options?: Float.Options): number;
function Float(options: Float.Options = {}){
  const { double, ...rest } = options;

  return FloatColumn.create({
    datatype: double ? "DOUBLE" : "FLOAT",
    ...rest
  });
}

function Double(options: Float.Optional): number | null | undefined;
function Double(options?: Float.Options): number;
function Double(options?: Float.Options){
  return Float({ ...options, double: true });
}

class FloatColumn extends Field {
  datatype = "FLOAT";
  placeholder = Infinity;
}

export default Float;
export { Double, Float }