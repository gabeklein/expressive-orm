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

  interface Where {
    <T extends Entity>(entity: Entity.Type<T>): Values<T>;
    <T>(field: T): Assert<T>;

    any(...where: Instruction[]): Instruction;
    all(...where: Instruction[]): Instruction;

    from<T extends Entity>(entity: Entity.Type<T>): Values<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode?: "right" | "inner"): Values<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode: Join): Partial<Values<T>>;
  }

  interface Assert<T> {
    is(equalTo: T): Instruction;
    not(equalTo: T): Instruction;
    greater(than: T): Instruction;
    less(than: T): Instruction;
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
      all: this.group.bind(this, "AND"),
      from: this.use.bind(this),
      left: this.add.bind(this)
    })
  }

  assert<T extends Entity>(entity: Entity.Type<T>): Query.Values<T>;
  assert<T>(field: T): Query.Assert<T>;
  assert(arg: any){
    const { where } = this;

    if(typeof arg === "function")
      return this.use(arg);

    return {
      is: where.bind(this, "=", arg),
      not: where.bind(this, "<>", arg),
      greater: where.bind(this, ">", arg),
      less: where.bind(this, "<", arg)
    } as Query.Assert<any>;
  }

  access(field: Field){
    return () => field;
  }

  commit(){
    if(this.source)
      this.source.focus = undefined;

    this.pending.forEach(apply => apply());
  }

  group(
    keyword: "AND" | "OR",
    ...where: Instruction[]){

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

  use<T extends Entity>(
    entity: Entity.Type<T>): Query.Values<T>{

    let { name, schema, connection } = entity.table;
    let alias: string | undefined;

    this.source = entity.table;
    this.connection = connection;

    if(schema){
      name = qualify(schema, name);
      alias = "$0";
    }

    return this.declare(entity, { name, alias });
  }

  add<T extends Entity>(
    entity: Entity.Type<T>, mode?: Query.Join){

    if(!this.source)
      throw new Error("Must define primary Entity first; did you forget to use from?");

    let { name, schema } = entity.table;
    let alias: string | undefined;

    if(schema){
      name = qualify(schema, name);
      alias = `$${this.tables.length}`;
    }

    return this.declare(entity, {
      join: mode || "inner",
      name,
      alias,
      on: []
    });
  }

  table(from: any){
    const table = Metadata.get(from);

    if(table)
      return table;
    else
      throw new Error("Value has no associated table.")
  }

  declare(entity: Entity.Type, metadata?: Query.Table){
    const proxy = {} as any;

    if(metadata){
      this.tables.push(metadata);
      Metadata.set(proxy, metadata);
    }

    entity.table.fields.forEach((field, key) => {
      field = Object.create(field);

      if(metadata)
        Metadata.set(field, metadata);

      Object.defineProperty(proxy, key, {
        get: field.proxy(this, proxy)
      })
    })

    return proxy;
  }

  where(
    op: string,
    left: Field,
    right: string | number | Field
  ){
    const apply: Instruction = (arg) => {
      const { alias, name, on: joinOn } = this.table(left);
      const column = qualify(alias || name, left.column);
      let entry: string;

      if(right instanceof Field){
        const { alias, name } = this.table(right);
        const ref = qualify(alias || name, right.column);

        entry = `${column} ${op} ${ref}`;
      }
      else {
        if(left.set)
          right = left.set(right);
    
        if(typeof right == "string")
          right = escapeString(right);

        entry = `${column} ${op} ${right}`;
      }

      if(typeof arg === "function")
        entry = arg(entry);

      if(arg !== true)
        if(joinOn && right instanceof Field)
          joinOn.push(entry);
        else
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
      const { name, alias, join, on: filter } = table;
  
      const type = join!.toUpperCase();
      let statement = `${type} JOIN ${qualify(name)}`;
  
      if(alias)
        statement += ` AS ${qualify(alias)}`;
  
      if(filter) 
        statement += ` ON ` + filter.join(" AND ");
  
      lines.push(statement);
    }
  
    return lines.join(" ");
  }

  generateWhere(){
    if(!this.wheres.length)
      return ""
    
    const where = this.wheres.join(" AND ");
  
    return "WHERE " + where;
  }
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