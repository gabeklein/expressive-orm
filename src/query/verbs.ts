import Field from '../Field';
import { qualify } from '../utility';
import { generateSelect, generateTables, generateWhere, serialize } from './generate';
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

  const targets = from.map(entity => {
    const table = RelevantTable.get(entity);

    if(table)
      return table;

    throw new Error(`Argument ${entity} is not a query entity.`);
  });
  
  query.commit(() => {
    let sql = `DELETE ${
      targets.map(x => x.alias || x.name).join(", ")
    }`;

    if(query.tables.length > 1 || targets[0].alias)
      sql += " " + generateTables(query);

    sql += " " + generateWhere(query);

    return sql;
  });
}

export function updateQuery(
  query: Query<any>,
  from: Query.Type<any>,
  update: Query.Update<any>
){
  const meta = RelevantTable.get(from);

  if(!meta)
    throw new Error(`Argument ${from} is not a query entity.`);

  const values = {} as any;

  Object.entries(update).forEach((entry) => {
    const [key, value] = entry;
    const field = meta.entity.fields.get(key);

    if(!field)
      throw new Error(
        `Property ${key} has no corresponding field in entity ${meta.entity.constructor.name}`
      );

    values[field.column] = field.set ? field.set(value) : value;
  });
  
  query.commit(() => {
    const tableName = qualify(meta.entity.table);
    const updates = [] as string[];

    Object.entries(values).forEach(([column, value]) => {
      updates.push(`${qualify(column)} = ${serialize(value)}`);
    })

    let sql = `UPDATE ${tableName} SET ${updates.join(", ")}`;

    if(query.tables.length > 1 || query.tables[0].alias)
      sql += " " + generateTables(query);

    sql += " " + generateWhere(query);

    return sql;
  })
}

export function selectQuery<R = any>(
  query: Query<any>,
  select: R | (() => R),
  limit?: number
): (raw: any[]) => R[] {
  const selects = new Map<Field, number | string>();
  
  query.commit(() => {
    const statements = [
      generateSelect(selects),
      generateTables(query),
      generateWhere(query)
    ];

    if(typeof limit == "number")
      statements.push(`LIMIT ${limit}`);

    return statements.join(" ");
  })

  switch(typeof select){
    case "object":
      if(select instanceof Field){
        selects.set(select, select.column);
    
        return raw => raw.map(row => {
          return select.get(row[select.column]);
        });
      }
      else if(select){
        Object.getOwnPropertyNames(select).forEach(key => {
          const value = (select as any)[key];
      
          if(value instanceof Field)
            selects.set(value, key);
        })
    
        return raw => raw.map(row => {
          const output = Object.create(select as {});
      
          selects.forEach((column, field) => {
            Object.defineProperty(output, column, {
              value: field.get(row[column])
            })
          })
          
          return output as R;
        })
      }

    case "function": {
      let focus: any;
  
      query.access = field => {
        selects.set(field, selects.size + 1);
        return field.placeholder;
      };
  
      (select as () => R)();
  
      query.access = field => {
        const value = focus[selects.get(field)!];
        return value === null ? undefined : value;
      }
  
      return raw => {
        const results = [] as R[];
  
        for(const row of raw){
          focus = row;
          results.push((select as () => R)());
        }
  
        return results;
      }
    }

    default:
      throw new Error("Bad argument");
  }
}