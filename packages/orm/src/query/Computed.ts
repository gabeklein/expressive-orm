import type { Query } from './Query';
import { render, Value } from './Value';

type ANumeric = Query.Match<string | number>;
type Numeric = Query.Match<number>;

function op(operator: string, rank: number) {
  return (left: unknown, right?: unknown) => new Computed<any>(operator, left, right, rank);
}

interface MathOps {
  add(left: Numeric, right: Numeric): Computed<number>;
  add(left: ANumeric, right: ANumeric): Computed<string | number>;
  sub(left: Numeric, right: Numeric): Computed<number>;
  mul(left: Numeric, right: Numeric): Computed<number>;
  div(left: Numeric, right: Numeric): Computed<number>;
  mod(left: Numeric, right: Numeric): Computed<number>;
  neg(value: Numeric): Computed<number>;
  pos(value: Numeric): Computed<number>;
}

const MathOps: MathOps = {
  add: op('+', 4),
  sub: op('-', 4),
  mul: op('*', 5),
  div: op('/', 5),
  mod: op('%', 5),
  neg: op('-', 7),
  pos: op('+', 7),
}

interface BitWise {
  not(value: Numeric): Computed<number>;
  and(left: Numeric, right: Numeric): Computed<number>;
  or(left: Numeric, right: Numeric): Computed<number>;
  xor(left: Numeric, right: Numeric): Computed<number>;
  left(value: Numeric, shift: Numeric): Computed<number>;
  right(value: Numeric, shift: Numeric): Computed<number>;
}

const BitWise: BitWise = {
  not: op('~', 6),
  left: op('<<', 3),
  right: op('>>', 3),
  and: op('&', 2),
  or: op('|', 0),
  xor: op('^', 1),
}

class Computed<T> extends Value {
  declare readonly returns?: T;

  readonly left?: unknown;
  readonly right: unknown;

  constructor(
    readonly operator: string,
    value: unknown,
    right: unknown,
    readonly rank: number
  ) {
    super();

    if (right === undefined)
      this.right = value;
    else {
      this.left = value;
      this.right = right;
    }
  }

  toString(): string {
    const { left, operator, right, rank } = this;
    const wrap = (side: unknown, tight: boolean) => (
      side instanceof Computed && (tight ? side.rank <= rank : side.rank < rank)
        ? `(${side})`
        : render(side)
    );

    return left === undefined
      ? operator + wrap(right, true)
      : `${wrap(left, false)} ${operator} ${wrap(right, true)}`;
  }
}

export { MathOps, BitWise, Computed };
