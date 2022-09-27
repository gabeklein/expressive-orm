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
    equal(value: any, to: any): void;
    notEqual(value: any, to: any): void;
    greater(value: any, than: any): void;
    less(value: any, than: any): void;
    from<T extends Entity>(entity: Entity.Type<T>): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode?: "right" | "inner"): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode: Query.Join): Query.Maybe<T>;
  }
}

class Query<R = any> {
  clauses = new Set<string>();
  connection?: Connection;
  interface: Query.Where;
  source?: Table;
  tables = new Map<any, Query.Table>();

  constructor(){
    const { add, use, where } = this;

    this.interface = {
      equal: where.bind(this, "="),
      notEqual: where.bind(this, "<>"),
      greater: where.bind(this, ">"),
      less: where.bind(this, "<"),
      from: use.bind(this),
      join: add.bind(this)
    }
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
    const { alias, name, on } = Metadata.get(left)!;

    if(left.set && typeof right !== "object")
      right = left.set(right);

    const column = qualify(alias || name, left.column);

    if(typeof right == "object"){
      const { alias, name } = Metadata.get(right)!;
      const ref = qualify(alias || name, right.column);
      const joinOn = on;

      if(joinOn)
        joinOn.push(`${column} ${op} ${ref}`);
    }
    else {
      if(typeof right === "string")
        right = escapeString(right);
        
      this.clauses.add(`${column} ${op} ${right}`);
    }
  }

  toString(): string {
    if(this.source)
      this.source.focus = undefined;

    return stringify(this);
  }
}

export default Query;