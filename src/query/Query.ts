import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import { escapeString, qualify } from '../utility';
import { generateTables, generateWhere, whereObject } from './generate';
import { deleteQuery, fetchQuery, getQuery, updateQuery } from './verbs';

export const RelevantTable = new WeakMap<{}, Query.Table>();
declare const ENTITY: unique symbol;

declare namespace Query {
  type Join = "left" | "right" | "inner" | "full";

  interface Table {
    entity: Entity.Type;
    name: string;
    join?: Query.Join;
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

  interface Verbs {
    get<T>(select: () => T): Execute<T[]>;
    get<T>(select: T): Execute<T[]>;

    get<T>(limit: number, select: () => T): Execute<T[]>;
    get<T>(limit: number, select: T): Execute<T[]>;

    getOne<T>(select: () => T, orFail: true): Execute<T>;
    getOne<T>(select: T, orFail: true): Execute<T>;
    getOne<T>(select: () => T, orFail?: boolean): Execute<T | undefined>;
    getOne<T>(select: T, orFail?: boolean): Execute<T | undefined>;

    getOneOrFail<T>(select: () => T): Execute<T>;
    getOneOrFail<T>(select: T): Execute<T>;

    delete(...entries: Query.Type<any>[]): void;
    update<T extends Entity>(entry: Query.Type<T>, values: Query.Update<T>): void;
  }

  interface Assert {
    <T extends Entity>(entity: Type<T>): { has(values: Compare<T>): void };
    <T>(field: T): Query.Assertions<T>;

    any(...where: Instruction[]): Instruction;
    all(...where: Instruction[]): Instruction;
  }

  interface Where extends Verbs, Assert {
    <T extends Entity>(entity: Entity.Type<T>): Type<T>;
    <T extends Entity>(entity: Entity.Type<T>, join: "left" | "outer", on?: Compare<T>): Partial<Type<T>>;
    <T extends Entity>(entity: Entity.Type<T>, join: Join, on?: Compare<T>): Type<T>;
    <T extends Entity>(entity: Entity.Type<T>, on: Compare<T>): Type<T>;
  }

  interface Assertions<T> {
    is(equalTo: T | undefined): Instruction;
    not(equalTo: T | undefined): Instruction;
    greater(than: T | undefined): Instruction;
    less(than: T | undefined): Instruction;
  }

  type Function<R> = (where: Query.Where) => Execute<R> | void;

  type Output<T> = T extends void ? number : T;
}

interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

class Query<T = void> {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as string[];

  interface = this.prepare();
  connection?: Connection;
  main?: Entity.Type;

  toString(): string {
    this.commit(() => [
      "SELECT COUNT(*)",
      generateTables(this),
      generateWhere(this)
    ].join(" "));

    return String(this);
  }

  async run(){
    return this.send().then(res => res[0]["COUNT(*)"]);
  }

  async send(){
    const sql = this.toString();

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.connection.query(sql);
  }

  constructor(from?: Query.Function<T>){
    this.interface = this.prepare();
    
    if(from){
      const exec = from(this.interface);

      if(exec)
        this.run = exec as any;
    }
  }

  private prepare(): Query.Where {
    const where = (
      a1: any,
      a2?: Query.Join | {},
      a3?: {}): any => {

      if(typeof a2 == "object")
        a3 = a2, a2 = "inner";
  
      return typeof a1 == "function"
        ? this.table(a1, a2 as any, a3)
        : this.compare(a1);
    }

    const select: Query.Verbs = {
      get: (a1: any, a2?: any) => {
        if(!a2)
          a2 = a1, a1 = undefined;
    
        return getQuery(this, a2, a1);
      },
      getOne: (select, orFail) => {
        return fetchQuery(this, select, orFail);
      },
      getOneOrFail: (from) => {
        return fetchQuery(this, from, true);
      },
      delete: (...from: Query.Type<any>[]) => {
        deleteQuery(this, from);
      },
      update: (from: Query.Type<any>, update: Query.Update<any>) => {
        updateQuery(this, from, update);
      }
    }

    return Object.assign(where, select, {
      any: this.group.bind(this, "OR"),
      all: this.group.bind(this, "AND"),
    })
  }

  access(field: Field): any {
    return field;
  }

  commit(toString: () => string){
    if(this.hasOwnProperty("toString"))
      throw new Error("Query has already been committed.");

    this.toString = toString;

    if(this.main)
      this.main.focus = undefined;

    this.pending.forEach(apply => apply());
  }

  compare(a1: Field | any){
    if(a1 instanceof Field){
      const { assert } = this;

      return {
        is: assert.bind(this, "=", a1),
        not: assert.bind(this, "<>", a1),
        greater: assert.bind(this, ">", a1),
        less: assert.bind(this, "<", a1)
      } as Query.Assertions<any>;
    }

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

  table<T extends Entity>(entity: Entity.Type<T>, join: "left" | "full", on?: Query.Compare<T>): Partial<Query.Type<T>>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>): Query.Type<T>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>){
    const { tables } = this;
    let { schema, table } = entity.ensure();
    let alias: string | undefined;
    let where: string[] | undefined;

    if(schema){
      table = qualify(schema, table);
      alias = `$${tables.length}`;
    }

    if(tables.length){
      if(this.connection !== entity.connection)
        throw new Error(`Joined entity ${entity} does not share an SQL connection with ${this.main}`);
    
      if(!join)
        join = "inner";

      where = Array.isArray(on) ? on :
        whereObject(table, entity, on);
    }
    else {
      this.main = entity;
      this.connection = entity.connection;
    } 

    const proxy = {} as any;
    const metadata = {
      alias,
      entity,
      join,
      name: table,
      on: where
    };

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

  assert(op: string, left: Field, right: string | number){
    const apply: Instruction = (arg) => {
      const column = left.qualifiedName;

      if(left.set)
        right = left.set(right);

      if(typeof right == "string")
        right = escapeString(right);

      let entry = `${column} ${op} ${right}`;

      if(typeof arg === "function")
        entry = arg(entry);

      if(arg !== true)
        this.wheres.push(entry);

      return entry;
    };

    this.pending.push(apply);

    return apply;
  }

  static find<T>(from: (where: Query.Where) => T | (() => T)){
    const query = new this(where => {
      return where.getOne<T>(from(where) as any);
    })

    return query.run();
  }

  // TODO: why are types not inferred?
  static get<T>(from: (where: Query.Where) => T | (() => T)){
    const query = new this(where => {
      return where.get<T>(from(where) as any);
    })

    return query.run();
  }

  static getOne<T>(from: (where: Query.Where) => T | (() => T)){
    const query = new this(where => {
      return where.getOne<T>(from(where) as any, true);
    })

    return query.run();
  }
}

export default Query;