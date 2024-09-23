import { Connection } from '../connection/Connection';
import { Field } from '../field/Field';
import { Type } from '../Type';
// import { escapeString } from '../utility';
import { generate } from './generate';
import { queryVerbs, Verbs } from './verbs';
import { queryWhere } from './where';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

export interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

declare namespace Query { 
  namespace Join {
    type Mode = "left" | "right" | "inner" | "full";

    type Where = <T>(field: T) => Field.Assert<T>;

    type Function<R = void> = (on: Where) => R;

    type Object<T extends Type> = {
      [K in Type.Field<T>]?: T[K];
    }
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

  type EntityOfType<T extends Type> = {
    [K in Type.Field<T>]: Exclude<T[K], null>;
  } & {
    [ENTITY]?: T
  }

  type Compare<T extends Type> = {
    [K in Type.Field<T>]?: T[K];
  }

  // TODO: make this default/nullable aware.
  type Update<T extends Type> = {
    [K in Type.Field<T>]?: Exclude<T[K], undefined>;
  }

  interface From {
    <T extends Type>(entity: Type.EntityType<T>): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Join.Function<"left" | "outer">): Partial<EntityOfType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, on: Join.Function<Join.Mode | void>): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join: "left" | "outer"): Partial<EntityOfType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T>, join?: Join.Mode): EntityOfType<T>;
    <T>(field: T): Field.Assert<T>;
  }

  interface Where extends From, Verbs {}

  type Function<R> = (where: Query.Where) => Execute<R> | void;

  type Select<R> = ((where: Where) => R | (() => R))

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";

  type JoinOn<T extends Type> = string[] | Query.Compare<T> | Join.Function;
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as Query.Cond[];
  order = [] as [Field, "asc" | "desc"][];

  where: Query.Where;
  connection?: Connection;
  main?: Type.EntityType;

  selects?: Map<string | Field, string | number>;
  deletes?: Query.Table;
  updates?: {
    table: string;
    values: Map<Field, any>;
  };

  mode?: Query.Mode;
  limit?: number;

  constructor(from?: Query.Function<T>){
    const verbs = queryVerbs(this);
    const where = queryWhere(this);

    this.where = Object.assign(where, verbs) as Query.Where;
    
    if(from){
      const exec = from(this.where);

      if(exec)
        this.run = exec as any;
    }
  }

  toQueryBuilder(){
    if(!this.mode){
      this.commit("select");
      this.selects = new Map([["COUNT(*)", "count"]]);
    }

    return generate(this, this.connection?.knex);
  }

  toString(){
    return this.toQueryBuilder().toString().replace(/```/g, "`");
  }

  async run(): Promise<T> {
    return this.toQueryBuilder().then(res => res[0].count);
  }

  // redundant
  async send(){
    return await this.toQueryBuilder();
  }

  access(field: Field): any {
    return field;
  }

  commit(mode: Query.Mode){
    // not necessary but happens to be causing errors
    // if(this.mode)
    //   throw new Error("Query has already been committed.");

    this.mode = mode;

    if(this.main)
      this.main.focus = undefined;

    this.pending.forEach(apply => apply());
  }

  group(keyword: "and" | "or", ...where: Instruction[]){
    const sep = ` ${keyword} `;
    const root = this.pending;
    const [cond, ...rest] = where;

    const apply: Instruction = (arg) => {
      if(arg === true)
        return "(" + where.map(where => where(true)).join(sep) + ")";

      cond(where => {
        where += rest.map(cond => sep + cond(true)).join("");

        if(typeof arg == "function")
          return arg("(" + where + ")");

        return where;
      });
    }

    root.splice(root.indexOf(cond), where.length, apply);

    return apply
  }

  static run<R>(where: Query.Function<R>){
    return new Query(where).run();
  }

  static get<R>(where: Query.Select<R>){
    return this.run(i => i.selects(where(i) as R));
  }

  static one<R>(where: Query.Select<R>){
    return this.run(i => i.one(where(i) as R));
  }

  static has<R>(where: Query.Select<R>){
    return this.run(i => i.has(where(i) as R));
  }
}

export { Query }