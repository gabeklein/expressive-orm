import { Field } from '../Field';
import { Type } from '../Type';
import { Instruction, Query, RelevantTable } from './Query';

export interface Verbs {
  deletes(entry: Query.FromType<any>): void;

  updates<T extends Type>(entry: Query.FromType<T>, values: Query.Update<T>): void;

  sorts(value: any, as: "asc" | "desc"): void;

  any(...where: Instruction[]): Instruction;

  all(...where: Instruction[]): Instruction;
}

export function queryVerbs<T>(query: Query<T>): Verbs {
  return {
    deletes(from: Query.FromType<any>){
      deleteQuery(query, from);
    },
    updates(from: Query.FromType<any>, update: Query.Update<any>){
      updateQuery(query, from, update);
    },
    sorts(a: Field, b: "asc" | "desc"){
      query.order.push([a, b]);
    },
    any(...where: Instruction[]): Instruction {
      return query.group("or", ...where);
    },
    all(...where: Instruction[]): Instruction {
      return query.group("and", ...where);
    }
  }
}

function deleteQuery(
  query: Query<any>,
  from: Query.FromType<any>){

  const table = RelevantTable.get(from);

  if(!table)
    throw new Error(`Argument ${from} is not a query entity.`);

  query.commit("delete");
  query.deletes = table;
}

function updateQuery(
  query: Query<any>,
  from: Query.FromType<any>,
  update: Query.Update<any>){

  const meta = RelevantTable.get(from);

  if(!meta)
    throw new Error(`Argument ${from} is not a query entity.`);

  const values = new Map<Field, string>();
  const { name: table, type: entity } = meta;

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
): (raw: any[]) => R[] {
  const selects = new Map<string | Field, string | number>();

  query.commit("select");
  query.selects = selects;

  switch(typeof output){
    case "object":
      if(output instanceof Field){
        selects.set(output, output.column);
    
        return raw => raw.map(row => {
          const value = row[output.column];
          return output.get ? output.get(value) : value;
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
            const value = field instanceof Field && field.get
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