import { Connection } from '../connection/Connection';
import { Field } from '../Field';
import { Type } from '../Type';
import { generate } from './generate';
import { queryWhere } from './where';

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

  export interface Verbs <T extends Type> {
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

  type Execute<T> = () => Promise<T>;

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

  interface Where {
    <T extends Type>(entity: Type.EntityType<T>, on?: Join.Function<"inner" | void>): FromType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join?: "inner"): FromType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Join.Function<Join.Mode>): Partial<FromType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join: Join.Mode): Partial<FromType<T>>;

    <T extends Type>(field: FromType<T>): Verbs<T>;
    
    <T>(field: T): Field.Assert<T>;
    (field: unknown, as: "asc" | "desc"): void;
  }

  type Function<R> = (where: Where) => R | void;

  type Select<R> = ((where: Where) => R | (() => R))

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";

  type JoinOn<T extends Type> = string[] | Query.Compare<T> | Join.Function;

  type Sort = "asc" | "desc";
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as Query.Cond[];
  order = [] as [Field, "asc" | "desc"][];

  where: Query.Where;
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
    const output = from(
      this.where = queryWhere.bind(this) as Query.Where
    );

    if(!output)
      return;

    const selects = new Map<string | Field, string | number>();

    this.commit("select");
    this.selects = selects;
  
    switch(typeof output){
      case "object": {
        if(output instanceof Field){
          selects.set(output, output.column);
      
          this.parse = raw => raw.map(row => {
            const value = (row as any)[output.column];
            return output.get ? output.get(value) : value;
          });
        }
        else if(output){
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
        break;
      }
  
      case "function": {
        let focus: any;
    
        this.access = field => {
          selects.set(field, selects.size + 1);
          return field.placeholder;
        };
    
        (output as () => T)();
    
        this.access = field => {
          const value = focus[selects.get(field)!];
          return value === null ? undefined : value;
        }
    
        this.parse = raw => {
          const results = [] as T[];
    
          for(const row of raw){
            focus = row;
            results.push((output as () => T)());
          }
    
          return results;
        }
        break
      }
  
      default:
        throw new Error("Bad argument");
    }
  }

  toQueryBuilder(){
    return generate(this, this.connection?.knex);
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

  commit(mode: Query.Mode){
    this.mode = mode;
    this.pending.forEach(apply => apply());
  }

  static one<R>(where: Query.Function<R>, orFail?: boolean){
    return new Query(where).one(orFail);
  }
}

export { Query }