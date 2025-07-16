class Where {
  skip?: boolean;

  constructor(public op?: string, public value?: any) {
    if (arguments.length > 1 && value === undefined)
      this.skip = true;
  }
}

const equal = (value: any) => new Where('=', value);
const greaterThan = (value: any) => new Where('>', value);
const lessThan = (value: any) => new Where('<', value);
const greaterThanOrEqual = (value: any) => new Where('>=', value);
const lessThanOrEqual = (value: any) => new Where('<=', value);
const notEqual = (value: any) => new Where('!=', value);
const isLike = (value: any) => new Where('LIKE', value);
const isNull = () => new Where('IS NULL');
const notNull = () => new Where('IS NOT NULL');
const asc = () => new Where('asc');
const desc = () => new Where('desc');
const isIn = (values: any[]) => new Where('IN', values);
const notIn = (values: any[]) => new Where('NOT IN', values);

export {
  Where,
  equal,
  greaterThan,
  lessThan,
  greaterThanOrEqual,
  lessThanOrEqual,
  notEqual,
  isLike,
  isNull,
  notNull,
  isIn,
  notIn,
  asc,
  desc
}