import { Field } from '../type/Field';
import { Query } from './Query';
import { Value } from './Value';

type ANumeric = Query.Match<string | number>;
type Numeric = Query.Match<number>;

function op(operator: string, rank: number, unary?: boolean) {
  return (left: Value, right?: Value) => {
    return new Computed(operator, left, unary ? undefined : right, rank);
  };
}

interface MathOps {
  add(left: Numeric, right: Numeric): Numeric;
  add(left: ANumeric, right: ANumeric): ANumeric;
  sub(left: Numeric, right: Numeric): Numeric;
  mul(left: Numeric, right: Numeric): Numeric;
  div(left: Numeric, right: Numeric): Numeric;
  mod(left: Numeric, right: Numeric): Numeric;
  neg(value: Numeric): Numeric;
  pos(value: Numeric): Numeric;
}

const MathOps: MathOps = {
  add: op('+', 4),
  sub: op('-', 4),
  mul: op('*', 5),
  div: op('/', 5),
  mod: op('%', 5),
  neg: op('-', 7, true),
  pos: op('+', 7, true),
}

interface BitWise {
  not(value: Numeric): Numeric;
  and(left: Numeric, right: Numeric): Numeric;
  or(left: Numeric, right: Numeric): Numeric;
  xor(left: Numeric, right: Numeric): Numeric;
  left(value: Numeric, shift: Numeric): Numeric;
  right(value: Numeric, shift: Numeric): Numeric;
}

const BitWise: BitWise = {
  not: op('~', 6, true),
  left: op('<<', 3),
  right: op('>>', 3),
  and: op('&', 2),
  or: op('|', 0),
  xor: op('^', 1),
}

class Computed<T> extends Value {
  readonly left?: Query.Match | Field<T> | Computed<T>;
  readonly right: Query.Match | Field<T> | Computed<T>;

  readonly operator: string;
  readonly rank: number;
  
  constructor(
    operator: string,
    value: Value | Field<T> | Computed<T>,
    right?: Value | Field<T> | Computed<T>,
    rank: number = 0
  ) {
    super();
    this.operator = operator;
    this.rank = rank;

    if (right === undefined)
      this.right = value;
    else {
      this.left = value;
      this.right = right;
    }
  }
}

export { MathOps, BitWise, Computed };