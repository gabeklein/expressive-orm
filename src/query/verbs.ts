import Field from '../Field';
import Query, { RelevantTable } from './Query';

export function queryVerbs<T>(query: Query<T>): Query.Ops {
  return {
    get(a1: any, a2?: any){
      if(!a2)
        a2 = a1, a1 = undefined;
  
      return getQuery(query, a2, a1);
    },
    one(select, orFail){
      return findQuery(query, select, orFail);
    },
    has(from){
      return findQuery(query, from, true);
    },
    deletes(...from: Query.Type<any>[]){
      deleteQuery(query, from);
    },
    updates(from: Query.Type<any>, update: Query.Update<any>){
      updateQuery(query, from, update);
    }
  }
}

export function getQuery<T>(
  query: Query<any>,
  select: T | (() => T),
  limit: number){

  const parse = selectQuery(query, select, limit);

  return () => query.send().then(parse);
}

export function findQuery<T>(
  query: Query<any>,
  select: T | (() => T),
  orFail?: boolean){

  const parse = selectQuery(query, select, 1);

  return async () => {
    const raw = await query.send();

    if(raw.length < 1 && orFail)
      throw new Error("No result found.");

    return parse(raw)[0];
  }
}

export function deleteQuery(
  query: Query<any>,
  from: Query.Type<any>[]){

  const targets = new Set<Query.Table>();

  from.forEach(entity => {
    const table = RelevantTable.get(entity);

    if(table)
      return targets.add(table);

    throw new Error(`Argument ${entity} is not a query entity.`);
  });

  query.commit("delete");
  query.deletes = targets;
}

export function updateQuery(
  query: Query<any>,
  from: Query.Type<any>,
  update: Query.Update<any>
){
  const meta = RelevantTable.get(from);

  if(!meta)
    throw new Error(`Argument ${from} is not a query entity.`);

  const values = new Map<Field, string>();
  const { name: table , entity } = meta;

  Object.entries(update).forEach((entry) => {
    const [key, value] = entry;
    const field = entity.fields.get(key);

    if(!field)
      throw new Error(
        `Property ${key} has no corresponding field in entity ${entity.constructor.name}`
      );

    values.set(field, value);
  });

  query.commit("update");
  query.updates = { table, values };
}

export function selectQuery<R = any>(
  query: Query<any>,
  output: R | (() => R),
  limit?: number
): (raw: any[]) => R[] {
  const selects = new Map<string | Field, string | number>();

  query.commit("select");
  query.limit = limit;
  query.selects = selects;

  switch(typeof output){
    case "object":
      if(output instanceof Field){
        selects.set(output, output.column);
    
        return raw => raw.map(row => {
          return output.get(row[output.column]);
        });
      }
      else if(output){
        Object.getOwnPropertyNames(output).forEach(key => {
          const value = (output as any)[key];
      
          if(value instanceof Field)
            selects.set(value, key);
        })
    
        return raw => raw.map(row => {
          const values = Object.create(output as {});
      
          selects.forEach((column, field) => {
            const value = field instanceof Field
              ? field.get(row[column]) : field;

            Object.defineProperty(values, column, { value });
          })
          
          return values as R;
        })
      }

    case "function": {
      let focus: any;
  
      query.access = field => {
        selects.set(field, selects.size + 1);
        return field.placeholder;
      };
  
      (output as () => R)();
  
      query.access = field => {
        const value = focus[selects.get(field)!];
        return value === null ? undefined : value;
      }
  
      return raw => {
        const results = [] as R[];
  
        for(const row of raw){
          focus = row;
          results.push((output as () => R)());
        }
  
        return results;
      }
    }

    default:
      throw new Error("Bad argument");
  }
}