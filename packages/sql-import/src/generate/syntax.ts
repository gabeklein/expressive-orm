import * as t from '@expressive/estree';

export function field(
  property: string,
  instruction: string,
  arg?: t.Expression | t.object.Abstract | string | number,
  collapse?: string
){
  let argument: t.Expression | undefined;

  if(!arg || typeof arg !== "object")
    argument = t.literal(arg);

  else if(t.isNode(arg))
    argument = arg;

  else {
    const entries = Object.entries(arg);

    if(collapse && entries.length == 1){
      const [key, value] = entries[0];

      if(key == collapse)
        argument = t.expression(value);
    }
    else if(entries.length)
      argument = t.object(arg);
  }

  const expression = argument
    ? t.callExpression(instruction, argument)
    : t.callExpression(instruction);

  return t.classProperty(property, expression);
}