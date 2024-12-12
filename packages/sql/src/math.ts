import { Field } from "./Field";
import { Query } from "./Query";

type Value = Query.Value;
type ANumeric = Query.ANumeric;
type Numeric = Query.Numeric;

export interface Bitwise {
  not(value: Numeric): Numeric;
  and(left: Numeric, right: Numeric): Numeric;
  or(left: Numeric, right: Numeric): Numeric;
  xor(left: Numeric, right: Numeric): Numeric;
  left(value: Numeric, shift: Numeric): Numeric;
  right(value: Numeric, shift: Numeric): Numeric;
}

export interface MathOps {
  add(left: Numeric, right: Numeric): Numeric;
  add(left: ANumeric, right: ANumeric): ANumeric;
  sub(left: Numeric, right: Numeric): Numeric;
  mul(left: Numeric, right: Numeric): Numeric;
  div(left: Numeric, right: Numeric): Numeric;
  mod(left: Numeric, right: Numeric): Numeric;
  neg(value: Numeric): Numeric;
  pos(value: Numeric): Numeric;
  bit: Bitwise
}

export function math(): MathOps {
  function op(op: string, rank: number, unary: true): (value: Value) => Value;
  function op(op: string, rank: number, unary?: false): (left: Value, right: Value) => Value;
  function op(op: string, rank: number, arg2?: boolean){
    return (l: any, r?: any) => {
      const input = arg2 === true ? [op, l] : [l, op, r]
      const computed = new Computed(...input);

      computed.rank = rank || 0;

      return computed;
    }
  }

  return {
    add: op('+', 4),
    sub: op('-', 4),
    mul: op('*', 5),
    div: op('/', 5),
    mod: op('%,', 5),
    neg: op('-', 7, true),
    pos: op('+', 7, true),
    bit: {
      not: op('~', 6, true),
      left: op('<<', 3),
      right: op('>>', 3),
      and: op('&', 2),
      or: op('|', 0),
      xor: op('^', 1),
    }
  }
}

export class Computed<T> extends Array<T | Field<T> | Computed<T>> {
  rank = 0;

  get(input: unknown){
    return input as string;
  }
  
  toString(): string {
    return this.map(value => {
      if(typeof value == "number")
        return value;

      if(value instanceof Computed)
        return value.rank > this.rank ? value : `(${value})`;

      return String(value);
    }).join(" ");
  }
}