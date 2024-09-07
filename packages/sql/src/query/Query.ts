import { Connection } from '../connection/Connection';
import { Type } from '../Type';
import { Field } from '../field/Field';
import { qualify } from '../utility';
import { generate } from './generate';
import { queryVerbs, Verbs } from './verbs';
import { whereFunction, whereObject } from './where';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

declare namespace Query {
  namespace Join {
    type Mode = "left" | "right" | "inner" | "full";

    type Where = <T>(field: T) => Assertions<T>;

    type Function = (on: Where) => void;

    type Object<T extends Type> = {
      [K in Type.Field<T>]?: T[K];
    }

    interface Assertions<T> {
      is(equalTo: T | undefined): void;
      not(equalTo: T | undefined): void;
      greater(than: T | undefined): void;
      less(than: T | undefined): void;
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

  interface Assert {
    <T extends Type>(entity: EntityOfType<T>): { has(values: Compare<T>): void };
    <T>(field: T): Field.Assertions<T>;

    any(...where: Instruction[]): Instruction;
    all(...where: Instruction[]): Instruction;
    sort(value: any, as: "asc" | "desc"): void;
  }

  interface Where extends Verbs, Assert {
    <T extends Type>(entity: Type.EntityType<T>): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, join: "left" | "outer", on?: Compare<T> | Join.Function): Partial<EntityOfType<T>>;
    <T extends Type>(entity: Type.EntityType<T>, join: Join.Mode, on?: Compare<T> | Join.Function): EntityOfType<T>;
    <T extends Type>(entity: Type.EntityType<T>, on: Compare<T> | Join.Function): EntityOfType<T>;
  }

  type Function<R> = (where: Query.Where) => Execute<R> | void;

  type Select<R> =
    | ((where: Where) => () => R)
    | ((where: Where) => R)

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";

  type OnTable<T extends Type> = string[] | Query.Compare<T> | Join.Function
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as string[];
  order = [] as [Field, "asc" | "desc"][];

  where = this.prepare();
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
    this.where = this.prepare();
    
    if(from){
      const exec = from(this.where);

      if(exec)
        this.run = exec as any;
    }
  }

  private prepare(): Query.Where {
    const where = (
      target: any, a2?: any, a3?: {}): any => {
  
      if(typeof a2 !== "string")
        a3 = a2, a2 = "inner";

      return (
        typeof target == "function" ?
          this.table(target, a2, a3) :
        target instanceof Field ?
          target.where(this) :
          this.compare(target)
      )
    }

    const verbs = queryVerbs(this);

    return Object.assign(where, verbs, {
      any: this.group.bind(this, "OR"),
      all: this.group.bind(this, "AND"),
      sort: (a: Field, b: "asc" | "desc") => this.order.push([a, b])
    })
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

  compare(a1: any){
    const info = RelevantTable.get(a1);

    if(!info)
      throw new Error(`Cannot create assertions for ${a1}. Must be a field or full entity.`);

    return {
      has: (values: {}) => {
        this.wheres.push(
          ...whereObject(info.name, info.entity, values)
        )
      }
    }
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

  table<T extends Type>(entity: Type.EntityType<T>, join: "left" | "full", on?: Query.OnTable<T>): Partial<Query.EntityOfType<T>>;
  table<T extends Type>(entity: Type.EntityType<T>, join?: Query.Join.Mode, on?: Query.OnTable<T>): Query.EntityOfType<T>;
  table<T extends Type>(entity: Type.EntityType<T>, join?: Query.Join.Mode, on?: Query.OnTable<T>){
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