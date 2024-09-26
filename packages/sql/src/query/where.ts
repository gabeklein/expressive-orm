import { Type } from '../Type';
import { Field } from '../Field';
import { qualify } from '../utility';
import { Query, RelevantTable } from './Query';

export function queryWhere(
  this: Query<any>,
  target: Field | Query.FromType | Type.EntityType,
  on?: Query.Compare | Query.Join.Function | Query.Sort,
  join?: Query.Join.Mode){

  if(target instanceof Field){
    if(typeof on == "string"){
      this.order.push([target, on]);
      return
    }

    return target.assert(cond => {
      this.wheres.push(cond);
    });
  }

  if(typeof target === "object")
    return queryVerbs(this, target);

  let { schema, table: name } = target.ready();
  let alias: string | undefined;

  const { tables } = this;
  const proxy = {} as any;
  const metadata: Query.Table = { name, alias, type: target, join };

  if(schema){
    name = qualify(schema, name);
    alias = `$${tables.length}`;
  }

  RelevantTable.set(proxy, metadata);

  target.fields.forEach((field, key) => {
    field = Object.create(field);

    RelevantTable.set(field, metadata);
    Object.defineProperty(proxy, key, {
      get: field.proxy(this, proxy)
    })
  })

  if(tables.length){
    if(this.connection !== target.connection) 
      throw new Error(`Joined entity ${target} does not share a connection with ${this.main}`);
  
    if(!join)
      metadata.join = "inner";

    if(Array.isArray(on)){
      metadata.on = on;
    }
    else if(typeof on == "object"){
      const cond = [] as Query.Cond[];
    
      for(const key in on){
        const left = proxy[key];
        const right = (on as any)[key];
    
        if(!left)
          throw new Error(`${key} is not a valid field in ${target}.`);
    
        cond.push({ left, right, operator: "=" });
      }

      metadata.on = cond;
    }
    else if(typeof on == "function"){
      const conds = [] as Query.Cond[];

      this.pending.push(() => {
        on(field => {
          if(field instanceof Field)
            return field.assert(cond => {
              conds.push(cond);
            })
          else
            throw new Error("Join assertions can only apply to fields.");
        });
      })

      metadata.on = conds;
    }
    else
      throw new Error(`Invalid join on: ${on}`);
  }
  else {
    this.main = target;
    this.connection = target.connection;
  }

  tables.push(metadata);

  return proxy;
}

export function queryVerbs<T extends Type>(
  query: Query<T>, from: Query.FromType<T>): Query.Verbs<T> {

  return {
    delete(limit?: number){
      const table = RelevantTable.get(from);
    
      if(!table)
        throw new Error(`Argument ${from} is not a query entity.`);
    
      query.commit("delete");
      query.deletes = table;
      query.limit = limit;
    },
    update(update: Query.Update<any>, limit?: number){
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
      query.limit = limit;
    }
  }
}