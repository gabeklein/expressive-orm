import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import { escapeString, qualify } from '../utility';
import { whereObject } from './generate';

export const Metadata = new WeakMap<{}, Query.Table>();
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

  type Values<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null>;
  } & {
    [ENTITY]?: T
  }

  type Compare<T extends Entity> = {
    [K in Entity.Field<T>]?: T[K];
  }

  interface Where {
    <T extends Entity>(entity: Entity.Type<T>): Values<T>;
    <T extends Entity>(entity: Entity.Type<T>, join: "left" | "outer", on?: Compare<T>): Partial<Values<T>>;
    <T extends Entity>(entity: Entity.Type<T>, join: Join, on?: Compare<T>): Values<T>;
    <T extends Entity>(entity: Entity.Type<T>, on: Compare<T>): Values<T>;
    <T extends Entity>(entity: Values<T>): { has(values: Compare<T>): void };
    <T>(field: T): Query.Assert<T>;

    any(...where: Instruction[]): Instruction;
    all(...where: Instruction[]): Instruction;
  }

  interface Assert<T> {
    is(equalTo: T | undefined): Instruction;
    not(equalTo: T | undefined): Instruction;
    greater(than: T | undefined): Instruction;
    less(than: T | undefined): Instruction;
  }
}

interface Instruction {
  (skip?: true): void;
  (modify: (where: string) => string): void;
}

abstract class Query {
  pending = [] as Instruction[];
  tables = [] as Query.Table[];
  wheres = [] as string[];

  interface: Query.Where;
  connection?: Connection;
  main?: Entity.Type;

  constructor(){
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

    this.interface = Object.assign(where, {
      any: this.group.bind(this, "OR"),
      all: this.group.bind(this, "AND")
    })
  }

  compare(a1: Field | any){
    if(a1 instanceof Field){
      const { assert } = this;

      return {
        is: assert.bind(this, "=", a1),
        not: assert.bind(this, "<>", a1),
        greater: assert.bind(this, ">", a1),
        less: assert.bind(this, "<", a1)
      } as Query.Assert<any>;
    }

    const info = Metadata.get(a1);

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

  access(field: Field){
    return () => field;
  }

  commit(){
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

    root.splice(
      root.indexOf(cond),
      where.length,
      apply
    );

    return apply
  }

  table<T extends Entity>(entity: Entity.Type<T>, join: "left" | "full", on?: Query.Compare<T>): Partial<Query.Values<T>>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>): Query.Values<T>;
  table<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>){
    const { tables } = this;
    let { schema, table } = entity.ensure();
    let alias: string | undefined;

    if(schema){
      table = qualify(schema, table);
      alias = `$${tables.length}`;
    }

    if(this.tables.length){
      if(this.connection !== entity.connection)
        throw new Error(`Joined entity ${entity} does not share an SQL connection with ${this.main}`);
    
      if(!join)
        join = "inner";
    }
    else {
      this.main = entity;
      this.connection = entity.connection;
    }

    on = !tables.length ? undefined :
      Array.isArray(on) ? on :
      whereObject(table, entity, on)

    const proxy = {} as any;
    const metadata = { alias, entity, join, name: table, on };

    Metadata.set(proxy, metadata);
    tables.push(metadata);

    entity.fields.forEach((field, key) => {
      field = Object.create(field);

      Metadata.set(field, metadata);
      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })

    return proxy;
  }

  assert(op: string, left: Field, right: string | number){
    const apply: Instruction = (arg) => {
      const column = left.qualifiedName;
      let entry: string;

      if(left.set)
        right = left.set(right);

      if(typeof right == "string")
        right = escapeString(right);

      entry = `${column} ${op} ${right}`;

      if(typeof arg === "function")
        entry = arg(entry);

      if(arg !== true)
        this.wheres.push(entry);

      return entry;
    };

    this.pending.push(apply);

    return apply;
  }

  async exec(){
    const sql = this.toString();

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.connection.query(sql);
  } 
}

export default Query;