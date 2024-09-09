import { Connection } from '../connection/Connection';
import { Field } from '../field/Field';
import { Type } from '../Type';
import { escapeString, qualify } from '../utility';
import { generate } from './generate';
import { queryVerbs, Verbs } from './verbs';
import { whereFunction, whereObject } from './where';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

export interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

declare namespace Query {
  interface Expect<T> {
    is(equalTo: T | undefined): Instruction;
    isNot(equalTo: T | undefined): Instruction;
    isMore(than: T | undefined): Instruction;
    isLess(than: T | undefined): Instruction;
  } 

  namespace Join {
    type Mode = "left" | "right" | "inner" | "full";

    type Where = <T>(field: T) => Expect<T>;

    type Function = (on: Where) => void;

    type Object<T extends Type> = {
      [K in Type.Field<T>]?: T[K];
    }
  }

  interface Table {
    entity: Type.EntityType;
    name: string;
    join?: Join.Mode;
    alias?: string;
    on?: string[];
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

  interface Where extends Verbs {
    <T extends Type>(entity: Type.EntityType<T>): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, join: "left" | "outer", on?: Compare<T> | Join.Function): Partial<EntityOfType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, join: Join.Mode, on?: Compare<T> | Join.Function): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T> | Join.Function): EntityOfType<T>;
    <T extends Type>(entity: EntityOfType<T>): { has(values: Compare<T>): void };
    <T>(field: T): Query.Expect<T>;
  }

  type Function<R> = (where: Query.Where) => Execute<R> | void;

  type Select<R> = ((where: Where) => R | (() => R))

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";

  type JoinOn<T extends Type> = string[] | Query.Compare<T> | Join.Function;
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as string[];
  order = [] as [Field, "asc" | "desc"][];

  where: Query.Where;
  connection?: Connection;
  main?: Type.EntityType;

  selects?: Map<string | Field, string | number>;
  deletes?: Set<Query.Table>;
  updates?: {
    table: string;
    values: Map<Field, any>;
  };

  mode?: Query.Mode;
  limit?: number;

  constructor(from?: Query.Function<T>){
    const verbs = queryVerbs(this);
    const where = (target: any, a2?: any, a3?: {}) => {
      return this.use(target, a2, a3) as any;
    }

    this.where = Object.assign(where, verbs);
    
    if(from){
      const exec = from(this.where);

      if(exec)
        this.run = exec as any;
    }
  }

  private use(target: any, a2?: any, a3?: {}){
    if(target instanceof Field)
      return <Query.Expect<T>> {
        is: val => this.assert("=", target, val),
        isNot: val => this.assert("<>", target, val),
        isMore: val => this.assert(">", target, val),
        isLess: val => this.assert("<", target, val),
      }

    if(typeof target == "function"){
      if(typeof a2 !== "string"){
        a3 = a2;
        a2 = "inner";
      }

      return this.table(target, a2, a3);
    }

    const info = RelevantTable.get(target);

    if(!info)
      throw new Error(`Cannot create assertions for ${target}. Must be a field or full entity.`);

    return {
      has: (values: {}) => {
        this.wheres.push(
          ...whereObject(info.name, info.entity, values)
        )
      }
    }
  }

  toString(): string {
    if(!this.mode){
      this.commit("select");
      this.selects = new Map([["COUNT(*)", "count"]]);
    }

    return generate(this);
  }

  async run(): Promise<T> {
    return this.send().then(res => res[0].count);
  }

  async send(){
    const sql = this.toString();

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.connection.query(sql);
  }

  access(field: Field): any {
    return field;
  }

  commit(mode: Query.Mode){
    if(this.mode)
      throw new Error("Query has already been committed.");

    this.mode = mode;

    if(this.main)
      this.main.focus = undefined;

    this.pending.forEach(apply => apply());
  }

  group(keyword: "AND" | "OR", ...where: Instruction[]){
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

  table<T extends Type>(entity: Type.EntityType<T>, join: "left" | "full", on?: Query.JoinOn<T>): Partial<Query.EntityOfType<T>>;
  table<T extends Type>(entity: Type.EntityType<T>, join?: Query.Join.Mode, on?: Query.JoinOn<T>): Query.EntityOfType<T>;
  table<T extends Type>(entity: Type.EntityType<T>, join?: Query.Join.Mode, on?: Query.JoinOn<T>){
    const { tables } = this;
    let { schema, table } = entity.ensure();
    let alias: string | undefined;

    if(schema){
      table = qualify(schema, table);
      alias = `$${tables.length}`;
    }

    const proxy = {} as any;
    const metadata: Query.Table = {
      name: table,
      alias,
      entity,
      join
    };

    if(tables.length){
      if(this.connection !== entity.connection)
        throw new Error(`Joined entity ${entity} does not share an SQL connection with ${this.main}`);
    
      if(!join)
        metadata.join = "inner";

      if(typeof on == "function")
        on = whereFunction(this, on);
      else if(!Array.isArray(on))
        on = whereObject(table, entity, on);

      metadata.on = on;
    }
    else {
      this.main = entity;
      this.connection = entity.connection;
    }

    RelevantTable.set(proxy, metadata);
    tables.push(metadata);

    entity.fields.forEach((field, key) => {
      field = Object.create(field);

      RelevantTable.set(field, metadata);
      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })

    return proxy;
  }

  assert(op: string, left: Field, right: any){
    if(!(right instanceof Field)){
      if(left.set)
        right = left.set(right);

      if(typeof right == "string")
        right = escapeString(right);
    }

    const apply: Instruction = (arg) => {
      let entry = `${left} ${op} ${right}`;

      if(typeof arg === "function")
        entry = arg(entry);

      if(arg !== true)
        this.wheres.push(entry);

      return entry;
    };

    this.pending.push(apply);

    return apply;
  }

  static run<R>(where: Query.Function<R>){
    return new Query(where).run();
  }

  static get<R>(where: Query.Select<R>){
    return this.run(i => i.get(where(i) as R));
  }

  static one<R>(where: Query.Select<R>){
    return this.run(i => i.one(where(i) as R));
  }

  static has<R>(where: Query.Select<R>){
    return this.run(i => i.has(where(i) as R));
  }
}

export { Query }