import { bool, date, json, num, one, rows, str, Type, unique } from '@expressive/orm';

export function schema(){
  class Attorney extends Type {
    name = str();
    email = str({ type: "varchar", length: 40 }, unique);
    claims = rows(Claim);
  }

  class Claim extends Type {
    attorney = one(Attorney, null);
    filed = date(null);
    due = date({ type: "date" }, null);
    amount = num({ type: "decimal", precision: 10, scale: 2 }, null);
    count = num(null);
    closed = bool(null);
    payment = json<string[]>(null);
  }

  return { Attorney, Claim, types: [Attorney, Claim] };
}
