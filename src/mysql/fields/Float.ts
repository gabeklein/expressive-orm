import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Float {
  interface Options extends Field.Options {
    double?: boolean;
  }

  interface Optional extends Options {
    nullable: true;
  }
}

function Float(options: Float.Optional): number | null | undefined;
function Float(options?: Float.Options): number;
function Float(options: Float.Options = {}){
  const { double, ...rest } = options;

  return Column({
    datatype: double ? "DOUBLE" : "FLOAT",
    placeholder: Infinity,
    ...rest
  });
}

function Double(options: Float.Optional): number | null | undefined;
function Double(options?: Float.Options): number;
function Double(options?: Float.Options){
  return Float({ ...options, double: true });
}

export default Float;
export { Double, Float }