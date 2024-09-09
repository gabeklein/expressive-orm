import { Type } from '../Type';
import { Field } from '../field/Field';
import { escapeString, qualify } from '../utility';
import { Query } from './Query';

export function whereObject<T extends Type>(
  table: string,
  entity: Type.EntityType<T>,
  on?: Query.Compare<T>){

  const cond = [] as string[];
  const { fields } = entity;

  for(const key in on){
    const field = fields.get(key);

    if(!field)
      throw new Error(`${key} is not a valid field in ${entity}`);

    const value = (on as any)[key];
    const right = typeof value == "string" ? escapeString(value) : value;
    const left = qualify(table) + "." + qualify(field.column);

    cond.push(`${left} = ${right}`);
  }
  
  return cond;
}

export function whereFunction(
  query: Query<any>,
  join: Query.Join.Function){

  const nested = query.wheres = [] as string[];
  query.pending.push(() => {
    const current = query.wheres;
    query.wheres = nested;
    join(field => {
      if(field instanceof Field)
        return field.assert(query);
      else
        throw new Error("Join assertions can only apply to fields.");
    });
    query.wheres = current;
  })
  return nested;
}