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
    name: string | Knex.AliasDict;
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
  tables = [] as Query.Table[];

  builder!: Knex.QueryBuilder;

  connection?: Connection;
  main?: Type.EntityType;
  parse = (raw: unknown[]) => raw;

  constructor(from: Query.Function<T>){
    const output = from((
      type: unknown,
      on?: Query.Compare | Query.Join.Function<any> | Query.SortBy,
      join?: Query.Join.Mode
    ): any => {
      if(isTypeConstructor(type)){
        if(typeof on == "string")
          throw new Error("Bad parameters.");

        return this.table(type, on, join);
      }

      if(type instanceof Field){
        if(typeof on == "string"){
          this.builder.orderBy(String(type), on);
          return
        }
    
        return type.assert(cond => {
          this.builder.andWhere(String(cond.left), cond.operator, cond.right as any);
        });
      }

      if(isFromType(type))
        return this.verbs(type);

      throw new Error("Invalid query.");
    });

    if(output)
      this.select(output);
  }

  select(output: T){
    const selects = new Map<string | Field, string | number>();

    this.builder.clearSelect();

    if(output instanceof Field){
      selects.set(output, output.column);

      this.builder.select({
        [output.column]: String(output)
      });
  
      this.parse = raw => raw.map(row => {
        const value = (row as any)[output.column];
        return output.get ? output.get(value) : value;
      });

      return;
    }

    if(typeof output == "object"){
      Object.getOwnPropertyNames(output).forEach(key => {
        const value = (output as any)[key];
    
        if(value instanceof Field){
          selects.set(value, key);
          this.builder.select({ [key]: String(value) });
        }
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
  }

  table(
    type: Type.EntityType,
    on?: Query.Compare | Query.Join.Function,
    join?: Query.Join.Mode
  ): Query.FromType {

    const { tables } = this;

    let { connection, fields, schema } = type.ready();
    let name: string | Knex.AliasDict = type.table
    let alias: string | undefined;
  
    if(schema){
      alias = `$${tables.length}`;
      name = { [alias]: qualify(schema, name) }
    }
  
    const proxy = {} as any;
    const metadata: Query.Table = { name, alias, type };
  
    tables.push(metadata);
    RelevantTable.set(proxy, metadata);
  
    fields.forEach((field, key) => {
      field = Object.create(field);
      RelevantTable.set(field, metadata);
      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })
  
    if(this.main === undefined){
      this.main = type;
      this.connection = connection;

      const engine = connection?.knex || knex({
        client: "sqlite3",
        useNullAsDefault: true,
        pool: { max: 0 }
      });

      this.builder = engine(name).select({ count: "COUNT(*)" });;
    }
    else {
      if(this.connection !== connection)
        throw new Error(`Joined entity ${type} does not share a connection with ${this.main}`);
      
      function callback(table: Knex.JoinClause) {
        if (typeof on == "function") {
          on(field => {
            if (field instanceof Field)
              return field.assert(cond => {
                table.on(String(cond.left), cond.operator, String(cond.right));
              });

            else
              throw new Error("Join assertions can only apply to fields.");
          });

          return;
        }

        if (typeof on == "object") {
          for (const key in on) {
            const left = proxy[key];
            const right = (on as any)[key];

            if (!left)
              throw new Error(`${key} is not a valid field in ${type}.`);

            table.on(String(left), "=", String(right));
          }

          return;
        }

        throw new Error(`Invalid join on: ${on}`);
      }
      
      switch(join){
        case "left":
          this.builder.leftJoin(name, callback);
          break;
  
        case "inner":
        case undefined:
          this.builder.join(name, callback);
          break;

        default:
          throw new Error(`Invalid join type ${join}.`);
      }

      metadata.join = join || "inner";
    }
  
    return proxy;
  }

  verbs<T extends Type>(from: Query.FromType<T>): Query.Verbs<T> {
    const { builder } = this;
    const table = RelevantTable.get(from);

    if(!table)
      throw new Error(`Argument ${from} is not a query entity.`);

    return {
      delete: (limit?: number) => {
        builder.table(table.name).delete();

        if(limit)
          builder.limit(limit);
      },
      update: (update: Query.Update<any>, limit?: number) => {
        const data = table.type.sanitize(update);

        builder.table(table.name).update(data);

        if(limit)
          builder.limit(limit);
      }
    }
  }

  count(){
    return this.builder.clone().clearSelect().count();
  }

  access(field: Field): any {
    return field;
  }

  toString(){
    return this.builder.toString().replace(/```/g, "`");
  }

  then(resolve: (res: any) => any, reject: (err: any) => any){
    return this.builder.then(this.parse).then(resolve).catch(reject);
  }

  async run(){
    return this.builder.then(this.parse) as Promise<T[]>;
  }

  async one(orFail?: boolean){
    const res = await this.builder.clone().limit(1).then(this.parse);

    if(res.length == 0 && orFail)
      throw new Error("Query returned no results.");

    return res[0] as T;
  }

  static one<R>(where: Query.Function<R>, orFail?: boolean){
    return new Query(where).one(orFail);
  }
}

function isFromType(type: any): type is Query.FromType {
  return RelevantTable.has(type);
}

export { Query }