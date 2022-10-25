import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import { qualify } from '../utility';
import { generate } from './generate';
import { queryVerbs } from './verbs';
import { whereFunction, whereObject } from './where';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

declare namespace Query {
  namespace Join {
    type Mode = "left" | "right" | "inner" | "full";

    type Where = <T>(field: T) => Assertions<T>;

    type Function = (on: Where) => void;

    type Object<T extends Entity> = {
      [K in Entity.Field<T>]?: T[K];
    }

    interface Assertions<T> {
      is(equalTo: T | undefined): void;
      not(equalTo: T | undefined): void;
      greater(than: T | undefined): void;
      less(than: T | undefined): void;
    } 
  }

  interface Table {
    entity: Entity.Type;
    name: string;
    join?: Query.Join.Mode;
    alias?: string;
    on?: string[];
  }

  type Execute<T> = () => Promise<T>;

  type Type<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null>;
  } & {
    [ENTITY]?: T
  }

  type Compare<T extends Entity> = {
    [K in Entity.Field<T>]?: T[K];
  }

  // TODO: make this default/nullable aware.
  type Update<T extends Entity> = {
    [K in Entity.Field<T>]?: Exclude<T[K], undefined>;
  }

  interface Ops {
    get<T>(select: () => T): Execute<T[]>;
    get<T>(select: T): Execute<T[]>;

    get<T>(limit: number, select: () => T): Execute<T[]>;
    get<T>(limit: number, select: T): Execute<T[]>;

    one<T>(select: () => T, orFail: true): Execute<T>;
    one<T>(select: T, orFail: true): Execute<T>;
    one<T>(select: () => T, orFail?: boolean): Execute<T | undefined>;
    one<T>(select: T, orFail?: boolean): Execute<T | undefined>;

    has<T>(select: () => T): Execute<T>;
    has<T>(select: T): Execute<T>;

    deletes(...entries: Query.Type<any>[]): void;
    updates<T extends Entity>(entry: Query.Type<T>, values: Query.Update<T>): void;
  }

  interface Assert {
    <T extends Entity>(entity: Type<T>): { has(values: Compare<T>): void };
    <T>(field: T): Field.Assertions<T>;

    any(...where: Instruction[]): Instruction;
    all(...where: Instruction[]): Instruction;
  }

  interface Where extends Ops, Assert {
    <T extends Entity>(entity: Entity.Type<T>): Type<T>;
    <T extends Entity>(entity: Entity.Type<T>, join: "left" | "outer", on?: Compare<T> | Query.Join.Function): Partial<Type<T>>;
    <T extends Entity>(entity: Entity.Type<T>, join: Join.Mode, on?: Compare<T> | Query.Join.Function): Type<T>;
    <T extends Entity>(entity: Entity.Type<T>, on: Compare<T> | Query.Join.Function): Type<T>;
  }

  type Function<R> = (where: Query.Where) => Execute<R> | void;

  type Select<R> =
    | ((where: Query.Where) => () => R)
    | ((where: Query.Where) => R)

  type Output<T> = T extends void ? number : T;

  type Mode = "select" | "update" | "delete";
}

interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as string[];

  where = this.prepare();
  connection?: Connection;
  main?: Entity.Type;

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
    })
  }

  toString(): string {
    if(!this.mode){
      this.commit("select");
      this.selects = new Map([["COUNT(*)", ""]]);
    }

    return generate(this);
  }

  async run(): Promise<T> {
    return this.send().then(res => res[0]["COUNT(*)"]);
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

    root.splice(
      root.indexOf(cond),
      where.length,
      apply
    );

    return apply
  }

  table<T extends Entity>(entity: Entity.Type<T>, join: "left" | "full", on?: string[] | Query.Compare<T> | Query.Join.Function): Partial<Query.Type<T>>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join.Mode, on?: string[] | Query.Compare<T> | Query.Join.Function): Query.Type<T>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join.Mode, on?: string[] | Query.Compare<T> | Query.Join.Function){
    const { tables } = this;
    let { schema, table } = entity.ensure();
    let alias: string | undefined;

    if(schema){
      table = qualify(schema, table);
      alias = `$${tables.length}`;
    }

    const proxy = {} as any;
    const metadata: Query.Table = {
      alias,
      entity,
      join,
      name: table
    };

    if(tables.length){
      if(this.connection !== entity.connection)
        throw new Error(`Joined entity ${entity} does not share an SQL connection with ${this.main}`);
    
      if(!join)
        metadata.join = "inner";

      metadata.on = 
        Array.isArray(on) ? on :
        typeof on == "function"
          ? whereFunction(this, on)
          : whereObject(table, entity, on);
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

export default Query;