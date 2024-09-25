import { Type } from '../Type';
import { Field } from '../Field';
import { qualify } from '../utility';
import { Query, RelevantTable } from './Query';

export function queryWhere(from: Query<any>){
  return (
    target: Field | typeof Type,
    on?: Query.Compare<any> | Query.Join.Function,
    join?: Query.Join.Mode) => {

    if(target instanceof Field)
      return target.assert(cond => {
        from.wheres.push(cond);
      });
  
    let { schema, table: name } = target.ready();
    let alias: string | undefined;

    const { tables } = from;
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
        get: field.proxy(from, proxy)
      })
    })

    if(tables.length){
      if(from.connection !== target.connection) 
        throw new Error(`Joined entity ${target} does not share a connection with ${from.main}`);
    
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

        from.pending.push(() => {
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
      from.main = target;
      from.connection = target.connection;
    }

    tables.push(metadata);

    return proxy;
  }
}