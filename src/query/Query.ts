import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import Table from '../Table';
import { escapeString, qualify } from '../utility';

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

  type AssertFunction = <T>(field: T) => Assert<T>;

  interface WhereFunction extends AssertFunction {
    <T extends Entity>(entity: Entity.Type<T>): Values<T>;
    <T extends Entity>(entity: Entity.Type<T>, join: "left" | "outer", on?: Query.Compare<T>): Partial<Query.Values<T>>;
    <T extends Entity>(entity: Entity.Type<T>, join: Query.Join, on?: Query.Compare<T>): Query.Values<T>;
    <T extends Entity>(entity: Entity.Type<T>, on: Query.Compare<T>): Query.Values<T>;
    <T extends Entity>(entity: Query.Values<T>): { has(values: Query.Compare<T>): void };
  }

  interface Where extends WhereFunction {
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
  source?: Table;

  constructor(){
    const assert = this.assert.bind(this);

    this.interface = Object.assign(assert, {
      any: this.group.bind(this, "OR"),
      all: this.group.bind(this, "AND")
    })
  }

  assert<T extends Entity>(entity: Entity.Type<T>, on?: Query.Compare<T>): Query.Values<T>;
  assert<T extends Entity>(entity: Entity.Type<T>, join: "left" | "full", on: Query.Compare<T>): Partial<Query.Values<T>>;
  assert<T extends Entity>(entity: Entity.Type<T>, join: Query.Join, on: Query.Compare<T>): Query.Values<T>;
  assert<T extends Entity>(entity: Query.Values<T>): { has(values: Query.Compare<T>): void };
  assert<T>(field: T): Query.Assert<T>;
  assert(a1: any, a2?: Query.Join | {}, a3?: {}){
    const { where } = this;

    if(typeof a2 == "object"){
      a3 = a2;
      a2 = "inner";
    }

    if(typeof a1 == "function")
      return this.add(a1, a2 as any, a3);

    if(a1 instanceof Field)
      return {
        is: where.bind(this, "=", a1),
        not: where.bind(this, "<>", a1),
        greater: where.bind(this, ">", a1),
        less: where.bind(this, "<", a1)
      } as Query.Assert<any>;

    const info = Metadata.get(a1);

    if(info){
      return {
        has: (values: {}) => {
          this.wheres.push(
            ...whereObject(info.name, info.entity, values)
          )
        }
      }
    }
  }

  access(field: Field){
    return () => field;
  }

  commit(){
    if(this.source)
      this.source.focus = undefined;

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

  table(from: any){
    const table = Metadata.get(from);

    if(table)
      return table;
    else
      throw new Error("Value has no associated table.")
  }

  add<T extends Entity>(entity: Entity.Type<T>, join: "left" | "full", on?: Query.Compare<T>): Partial<Query.Values<T>>;
  add<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>): Query.Values<T>;
  add<T extends Entity>(entity: Entity.Type<T>, join?: Query.Join, on?: string[] | Query.Compare<T>){
    const { table } = entity;
    const tables = this.tables.length;
  
    let { name, schema } = table;
    let alias: string | undefined;

    if(schema){
      name = qualify(schema, name);
      alias = `$${tables}`;
    }

    if(!this.tables.length){
      this.source = entity.table;
      this.connection = entity.table.connection;
    }
    else if(!join)
      join = "inner";

    on = !this.tables.length ? undefined :
      Array.isArray(on) ? on :
      whereObject(name, entity, on)

    const proxy = {} as any;
    const metadata = { alias, entity, join, name, on };

    Metadata.set(proxy, metadata);
    this.tables.push(metadata);

    entity.table.fields.forEach((field, key) => {
      field = Object.create(field);

      Metadata.set(field, metadata);
      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })

    return proxy;
  }

  where(op: string, left: Field, right: string | number){
    const apply: Instruction = (arg) => {
      const table = this.table(left);
      const column = qualify(table.alias || table.name, left.column);
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

  generateTables(){
    const [ from, ...joins ] = this.tables;
    const lines = [] as string[];
  
    let fromStatement = `FROM ${qualify(from.name)}`;
  
    if(from.alias)
      fromStatement += ` AS ${qualify(from.alias)}`;
  
    lines.push(fromStatement);
  
    for(const table of joins){
      const { name, alias, join, on } = table;
      let statement = `JOIN ${qualify(name)}`;

      if(join && join !== "inner")
        statement = join.toUpperCase() + " " + statement;

      if(alias)
        statement += ` AS ${qualify(alias)}`;
  
      if(on) 
        statement += ` ON ` + on.join(" AND ");
  
      lines.push(statement);
    }
  
    return lines.join(" ");
  }

  generateWhere(){
    if(!this.wheres.length)
      return "";
    
    const where = this.wheres.join(" AND ");
  
    return "WHERE " + where;
  }
}

function whereObject<T extends Entity>(
  table: string,
  entity: Entity.Type<T>,
  on?: Query.Compare<T>){

  const cond = [] as string[];
  const { fields } = entity.table;

  for(const key in on){
    const field = fields.get(key);
    const value = (on as any)[key];

    if(!field)
      throw new Error(`${key} is not a valid field in ${entity}`);

    const left = qualify(table) + "." + qualify(field.column);
    let right: string;

    if(value instanceof Field){
      const table = Metadata.get(value)!;

      right = qualify(table.name) + "." + qualify(value.column);
    }
    else
      right = typeof value == "string" ? escapeString(value) : value;

    cond.push(`${left} = ${right}`);
  }
  
  return cond;
}

export function serialize(value: any){
  switch(typeof value){
    case "undefined":
      return "default";

    case "object":
      if(value === null)
        return "NULL";
      else
        value = String(value);

    case "string":
      return `"` + value.replace(`"`, `\\"`) + `"`;

    case "number":
      return String(value);

    default:
      return "???";
  }
}

export default Query;