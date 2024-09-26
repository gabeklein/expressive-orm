import knex, { Knex } from 'knex';

import { Connection } from './connection/Connection';
import { Field } from './Field';
import { isTypeConstructor, Type } from './Type';
import { qualify } from './utility';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

export interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

declare namespace Query { 
  namespace Join {
    type Mode = "left" | "inner";

    type Where = <T>(field: T) => Field.Assert<T>;

    type Function<R = Mode> = (on: Where) => R;

    type Object<T extends Type> = {
      [K in Type.Field<T>]?: T[K];
    }
  }

  interface Verbs <T extends Type> {
    delete(limit?: number): void;
    update(values: Query.Update<T>, limit?: number): void;
  }

  type Cond<T = unknown> = {
    left: Field | T,
    right: Field | T,
    operator: string
  }

  interface Table {
    type: Type.EntityType;
    name: string;
    alias?: string;
    join?: Join.Mode;
    on?: Cond[];
  }

  type FromType<T extends Type = Type> = {
    [K in Type.Field<T>]: Exclude<T[K], null>;
  } & {
    [ENTITY]?: T
  }

  type Compare<T extends Type = Type> = {
    [K in Type.Field<T>]?: T[K];
  }

  // TODO: make this default/nullable aware.
  type Update<T extends Type> = {
    [K in Type.Field<T>]?: Exclude<T[K], undefined>;
  }

  type Function<R> = (where: Callback) => R | void;

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";

  type SortBy = "asc" | "desc";

  type JoinOn<T extends Type> = string[] | Query.Compare<T> | Join.Function;

  type Execute<T> = () => Promise<T>;

  interface Callback {
    <T extends Type>(entity: Type.EntityType<T>, on?: Join.Function<"inner" | void>): FromType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join?: "inner"): FromType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Join.Function<Join.Mode>): Partial<FromType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join: Join.Mode): Partial<FromType<T>>;

    <T extends Type>(field: FromType<T>): Verbs<T>;
    <T>(field: T): Field.Assert<T>;

    (field: unknown, as: SortBy): void;
  }
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as Query.Cond[];
  order = [] as [Field, "asc" | "desc"][];

  connection?: Connection;
  main?: Type.EntityType;
  parse = (raw: unknown[]) => raw;

  selects?: Map<string | Field, string | number>;
  deletes?: Query.Table;
  updates?: {
    table: string;
    values: Map<Field, any>;
  };

  mode?: Query.Mode;
  limit?: number;

  constructor(from: Query.Function<T>){
    const output = from((
      type: unknown,
      on?: Query.Compare | Query.Join.Function<any> | Query.SortBy,
      join?: Query.Join.Mode
    ): any => {
      if(type instanceof Field){
        if(typeof on == "string"){
          this.order.push([type, on]);
          return
        }
    
        return type.assert(cond => {
          this.wheres.push(cond);
        });
      }
    
      if(isTypeConstructor(type)){
        if(typeof on == "string")
          throw new Error("Bad parameters.");

        return this.table(type, on, join);
      }
  
      if(isFromType(type))
        return this.verbs(type);

      throw new Error("Invalid query.");
    });

    if(typeof output !== "object")
      return;

    const selects = this.selects = new Map<string | Field, string | number>();

    if(output instanceof Field){
      selects.set(output, output.column);
  
      this.parse = raw => raw.map(row => {
        const value = (row as any)[output.column];
        return output.get ? output.get(value) : value;
      });

      return;
    }
 
    Object.getOwnPropertyNames(output).forEach(key => {
      const value = (output as any)[key];
  
      if(value instanceof Field)
        selects.set(value, key);
    })

    this.parse = raw => raw.map(row => {
      const values = Object.create(output as {});
  
      selects.forEach((column, field) => {
        const value = field instanceof Field && field.get
          ? field.get((row as any)[column]) : field;

        Object.defineProperty(values, column, { value });
      })
      
      return values as T;
    })
  }

  table(
    type: Type.EntityType,
    on?: Query.Compare | Query.Join.Function,
    join?: Query.Join.Mode){

    let { schema, table: name } = type.ready();
    let alias: string | undefined;
  
    const { tables } = this;
    const proxy = {} as any;
    const metadata: Query.Table = { name, alias, type, join };
  
    if(schema){
      name = qualify(schema, name);
      alias = `$${tables.length}`;
    }
  
    RelevantTable.set(proxy, metadata);
  
    type.fields.forEach((field, key) => {
      field = Object.create(field);
  
      RelevantTable.set(field, metadata);
      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })
  
    if(tables.length === 0){
      this.main = type;
      this.connection = type.connection;
    }
    else if(this.connection === type.connection){
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
            throw new Error(`${key} is not a valid field in ${type}.`);
      
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
    else 
      throw new Error(`Joined entity ${type} does not share a connection with ${this.main}`);
  
    tables.push(metadata);
  
    return proxy as Query.FromType;
  }

  verbs<T extends Type>(from: Query.FromType<T>): Query.Verbs<T> {
    return {
      delete: (limit?: number) => {
        // @ts-ignore
        const table = RelevantTable.get(from);
      
        if(!table)
          throw new Error(`Argument ${from} is not a query entity.`);
      
        this.deletes = table;
        this.limit = limit;
      },
      update: (update: Query.Update<any>, limit?: number) => {
        // @ts-ignore
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
      
        this.updates = { table, values };
        this.limit = limit;
      }
    }
  }

  toQueryBuilder(){
    this.pending.forEach(apply => apply());
    this.pending = [];
  
    const {
      deletes,
      order,
      selects,
      tables,
      updates,
      wheres,
      limit,
      connection
    } = this;

    const engine =
      connection?.knex ||
      knex({
        client: "sqlite3",
        useNullAsDefault: true,
        pool: { max: 0 }
      });
  
    let query = engine.queryBuilder();
  
    if (selects) {
      selects.forEach((property, field) => {
        query.select(`${field} as ${property}`);
      });
    } 
    else if (updates) {
      query = engine(updates.table);
      const updateObj: { [key: string]: any } = {};
      updates.values.forEach((value, field) => {
        updateObj[field.column] = field.set ? field.set(value) : value;
      });
      query.update(updateObj);
    } 
    else if (deletes) {
      query = engine(deletes.name).del();
    } 
    else {
      // TDOO: Should this be replaced with star?
      query.select("COUNT(*) as count");
    }
  
    const [from, ...joins] = tables;
  
    query.from(from.name);
  
    if (from.alias)
      query.as(from.alias);
  
    joins.forEach(table => {
      const { on, join } = table;
      let { name } = table;
  
      if (table.alias)
        name = `${name} as ${table.alias}`;
  
      if (join && on){
        const clause: Knex.JoinCallback = (table) => {
          for(const { left, right, operator } of on)
            table.on(String(left), operator, String(right));
        }
  
        switch (join.toLowerCase()) {
          case 'inner':
            query.innerJoin(name, clause);
            break;
          case 'left':
            query.leftJoin(name, clause);
            break;
          case 'right':
            query.rightJoin(name, clause);
            break;
          case 'full':
            query.fullOuterJoin(name, clause);
            break;
        }
      }
    });
  
    if (wheres.length)
      for (const { left, right, operator } of wheres){
        const value = typeof right == "number" ? right : String(right);
        query.where(String(left), operator, value);
      }
  
    if (order && order.length)
      for (const [field, dir] of order)
        query.orderBy(String(field), dir);
  
    if (limit)
      query.limit(limit);
  
    return query
  }

  toString(){
    return this.toQueryBuilder().toString().replace(/```/g, "`");
  }

  then(resolve: (res: any) => any, reject: (err: any) => any){
    return this.toQueryBuilder().then(this.parse).then(resolve).catch(reject);
  }

  async run(){
    return this.toQueryBuilder().then(this.parse) as Promise<T[]>;
  }

  async one(orFail?: boolean){
    const res = await this.toQueryBuilder().limit(1).then(this.parse);

    if(res.length == 0 && orFail)
      throw new Error("Query returned no results.");

    return res[0] as T;
  }

  count(){
    return this.toQueryBuilder().clearSelect().count();
  }

  access(field: Field): any {
    return field;
  }

  static one<R>(where: Query.Function<R>, orFail?: boolean){
    return new Query(where).one(orFail);
  }
}

function isFromType(type: any): type is Query.FromType {
  return RelevantTable.has(type);
}

export { Query }