import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import { stringify } from './stringify';
import Table from '../Table';
import { escapeString, qualify } from '../utility';

export const Metadata = new WeakMap<{}, Query.Table>();

declare namespace Query {
  type Join = "left" | "right" | "inner" | "outer";

  interface Table {
    name: string;
    join?: Query.Join;
    alias?: string;
    on?: string[];
  }

  type Fields<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null>;
  }

  type Maybe<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null> | undefined;
  }

  interface Where {
    any(...where: WhereOp[]): WhereOp;
    all(...where: WhereOp[]): WhereOp;

    equal(value: any, to: any): WhereOp;
    notEqual(value: any, to: any): WhereOp;
    greater(value: any, than: any): WhereOp;
    less(value: any, than: any): WhereOp;

    from<T extends Entity>(entity: Entity.Type<T>): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode?: "right" | "inner"): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode: Query.Join): Query.Maybe<T>;
  }
}

interface WhereOp {
  (ignore?: false): void;
  (concat: string): void;
}

class Query {
  whereOps = [] as WhereOp[]
  wheres = [] as string[];
  tables = new Map<any, Query.Table>();

  interface: Query.Where;
  connection?: Connection;
  source?: Table;

  constructor(){
    const { add, group, use, where } = this;

    this.interface = {
      any: group.bind(this, "OR"),
      all: group.bind(this, "AND"),
      equal: where.bind(this, "="),
      notEqual: where.bind(this, "<>"),
      greater: where.bind(this, ">"),
      less: where.bind(this, "<"),
      from: use.bind(this),
      join: add.bind(this)
    }
  }

  commit(){
    this.whereOps.forEach(apply => apply());
  }

  group(
    keyword: "AND" | "OR",
    ...where: WhereOp[]){

    const root = this.whereOps;
    const [cond, ...rest] = where;

    const sep = ` ${keyword} `;
  
    const apply = (arg?: string | false) => {
      if(arg === false){
        const conds = where.map(where => where(false));

        return `(${conds.join(sep)})`;
      }

      let concat = rest.map(cond => sep + cond(false)).join("");

      if(typeof arg == "string")
        concat += arg;

      cond(concat);
    }

    root.splice(
      root.indexOf(cond),
      where.length,
      apply
    );

    return apply
  }

  use<T extends Entity>(
    entity: Entity.Type<T>): Query.Fields<T>{

    let { name, schema, connection } = entity.table;
    let alias: string | undefined;

    this.source = entity.table;
    this.connection = connection;

    if(schema){
      name = qualify(schema, name);
      alias = "$0"
    }

    return this.declare(entity, { name, alias });
  }

  add<T extends Entity>(
    entity: Entity.Type<T>, mode?: Query.Join){

    let { name, schema } = entity.table;
    let alias: string | undefined;

    if(schema){
      name = qualify(schema, name);
      alias = `$${this.tables.size}`;
    }

    return this.declare(entity, {
      join: mode || "inner",
      name,
      alias,
      on: []
    });
  }

  declare(entity: Entity.Type, metadata?: Query.Table){
    const proxy = {} as any;

    if(metadata)
      this.tables.set(proxy, metadata);

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
    const apply: WhereOp = (arg?: boolean | string) => {
      const { alias, name, on: joinOn } = Metadata.get(left)!;
      const column = qualify(alias || name, left.column);
      let entry: string;

      if(right instanceof Field){
        const { alias, name } = Metadata.get(right)!;
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

      if(typeof arg === "string")
        entry += arg;

      if(arg !== false)
        if(joinOn && right instanceof Field)
          joinOn.push(entry);
        else
          this.wheres.push(entry);

      return entry;
    };

    this.whereOps.push(apply);

    return apply;
  }

  toString(): string {
    if(this.source)
      this.source.focus = undefined;

    return stringify(this);
  }
}

export default Query;