import { Connection } from '../connection/Connection';
import { Field, Syntax } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Computed } from './Computed';
import { Query } from './Query';

type Selects = Field | Value | Computed<unknown>;

/** Specify the limit of results returned. */
function where(limit: number): void;

/**
 * Accepts other where() assertions for nesting in parenthesis.
 * 
 * Will alternate between AND-OR depending on depth, starting with OR.
 * 
 */
function where(...orWhere: Syntax[]): Syntax;

/**
 * Create a reference to the primary table, returned
 * object can be used to query against that table.
 */
function where<T extends Type>(entity: Type.EntityType<T>): Query.From<T>;

/**
 * Registers a type as inner join.
 */
function where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join?: "inner"): Query.Join<T>;

/**
 * Registers a type as a left join, returned object has optional
 * properties which may be undefined where the join is not present.
 */
function where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join: Query.Join.Mode): Query.Join.Left<T>;

/**
 * Prepares write operations for a particular table.
 */
function where<T extends Type>(field: Query.From<T>): Query.Verbs<T>;

/**
 * Prepare comparison against a particilar field,
 * returns operations for the given type.
 */
function where<T extends Field>(field: T): Query.Asserts<T>;

function where(this: Builder, arg1: any, arg2?: any, arg3?: any): any {
  if(arg1 instanceof Field)
    return {
      ...arg1.compare(this.wheres),
      asc: () => { this.orderBy.set(arg1, "asc") },
      desc: () => { this.orderBy.set(arg1, "desc") }
    }

  if(Type.is(arg1))
    return arg2
      ? this.join(arg1, arg2, arg3)
      : this.use(arg1).proxy;

  if(this.tables.has(arg1))
    return <Query.Verbs<Type>> {
      delete: () => {
        this.deletes.add(arg1);
      },
      update: (data: Query.Update<any>) => {
        this.updates.set(arg1, data);
      }
    }

  if(arg1 instanceof Syntax){
    const local = new Syntax();

    for(const eq of arguments){
      this.wheres.delete(eq)
      local.push(eq); 
    }

    this.wheres.add(local);

    return local;
  }

  if(typeof arg1 == "number"){
    this.limit = arg1;
    return;
  }

  throw new Error(`Argument ${arg1} is not a query argument.`);
}

class Builder {
  connection!: Connection;

  /**
   * If running in template mode, this records the order by which
   * parameters are used in the template itself. This is used to
   * ensure that no parameters are duplicated or injected in the
   * wrong order.
   */
  params?: Set<Parameter>;

  wheres = new Set<Syntax>();
  pending = new Set<() => void>();
  orderBy = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: Map<string, Selects> | Selects;
  limit?: number;

  constructor(factory: Query.Function<unknown> | Query.Factory<unknown, any[]>){
    let result = factory(where.bind(this));

    if(typeof result === 'function'){
      const index = this.params = new Set();
      const params = Array.from(result as { length: number }, (_, i) => {
        const p = new Parameter(i);
        
        return () => {
          if(index.has(p))
            throw new Error(`Parameter ${i} is already defined.`);
          else
            index.add(p);
  
          return p;
        }
      })

      result = (result as Function)(...params); 
    }

    if(!this.connection)
      this.connection = Connection.None;

    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(result)
      this.select(result);
  }

  use<T extends Type>(type: Type.EntityType<T>){
    const { fields, schema } = type;
    const { tables } = this;

    if(!this.connection && type.connection){
      this.connection = type.connection;
    }
    else if(type.connection !== this.connection){
      const [ main ] = tables.values();
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}.`);
    }

    const local = new Map<string, Field>();
    const proxy = {} as Query.From;
    const table: Query.Table = {
      name: type.table,
      proxy,
      local,
      toString(){
        return this.alias
          ? this.name + " " + this.alias
          : this.name;
      }
    };

    // TODO: also support self-joins
    if(schema){
      table.alias = 'T' + tables.size;
      table.name = schema + '.' + table.name;
    }

    tables.set(proxy, table);
    fields.forEach((field, key) => {
      field = create(field);
      field.table = table;
      field.query = this;
      local.set(key, field);

      let value: any;

      defineProperty(proxy, key, {
        get: () => value || (
          value = field.use ? field.use(this) : field
        )
      });
    });

    freeze(proxy);

    return table;
  }

  join<T extends Type>(
    type: Type.EntityType<T>,
    joinOn: Query.Join.On<T>,
    joinAs?: Query.Join.Mode){

    const table = this.use(type);
    
    if(typeof joinOn == "string")
      throw new Error("Bad parameters.");

    switch(joinAs){
      case undefined:
        joinAs = "inner";

      case "inner":
      case "left":
        break;

      case "right" as unknown:
      case "full" as unknown:
        const [ main ] = this.tables.values();
        throw new Error(`Cannot ${joinAs} join because that would affect ${main} which is already defined.`);

      default:
        throw new Error(`Invalid join type ${joinAs}.`);
    }
    
    const joinsOn = new Set<Syntax>();

    switch(typeof joinOn){
      case "object":
        for (const key in joinOn) {
          const left = table.local.get(key);
          const right = (joinOn as any)[key];

          if (left instanceof Field)
            joinsOn.add(left.compare().equal(right));
          else
            throw new Error(`${key} is not a valid column in ${type}.`);
        }
      break;

      case "function":
        this.pending.add(() => {
          joinOn(left => {
            if(left instanceof Field)
              return left.compare(joinsOn);

            throw new Error("Join assertions can only apply to fields.");
          });
        })
      break;

      default:
        throw new Error(`Invalid join on: ${joinOn}`);
    }

    table.join = {
      as: joinAs,
      on: joinsOn
    }

    return table.proxy as Query.Join<T>;
  }

  select(result: unknown){
    if(result instanceof Field || result instanceof Computed || result instanceof Value){
      this.selects = result;
      return;
    }

    const columns = new Map<string, Selects>();
      
    function scan(obj: any, path?: string) {
      getOwnPropertyNames(obj).forEach(key => {
        const select = obj[key];
        const use = path ? `${path}.${key}` : key;

        if (select instanceof Field || select instanceof Computed || select instanceof Value)
          columns.set(use, select);
        else if (typeof select === 'object')
          scan(select, use);
        else
          columns.set(use, new Value(select));
      })
    }

    scan(result);

    this.selects = columns;
  }

  accept(args: unknown[]){
    return Array.from(this.params || [], p => p.digest(args[p.index]));
  }

  parse(raw: Record<string, any>){
    const { selects } = this;

    if(selects instanceof Map){
      const values = {} as any;
      
      selects.forEach((field, column) => {
        const path = column.split('.');
        const property = path.pop()!;
        let target = values;

        for (const step of path)
          target = target[step] || (target[step] = {});

        const value = raw[column];

        target[property] = field instanceof Field
          ? field.get(value) : value;
      });

      return values;
    }

    const value = values(raw)[0];
    
    return selects instanceof Field ? selects.get(value) : raw;
  }

  toString() {
    const { deletes, limit, orderBy, tables, updates, wheres } = this;
    const [ main, ...joins ] = tables.values();

    let query;

    if(updates.size){
      query = `UPDATE ${main}`;
    }
    else if(deletes.size){
      const [ target ] = deletes;
      const { alias, name } = tables.get(target)!;

      query = tables.size > 1 || alias
        ? `DELETE ${alias || name} FROM ${main}`
        : `DELETE FROM ${main}`;
    }
    else {
      query = 'SELECT ' + this.toSelect();
      
      if(main)
        query += ' FROM ' + main;
    }

    for (const table of joins)
      query += this.toJoin(table);

    if(updates.size)
      query += ' SET ' + this.toUpdate();

    if (wheres.size)
      query += ' WHERE ' + this.toWhere(wheres);
  
    if (orderBy.size)
      query += ' ORDER BY ' + Array.from(orderBy).map(x => x.join(' '));
  
    if (limit)
      query += ' LIMIT ' + limit;
  
    return query;
  }

  toSelect(){
    const { selects } = this;

    if(selects instanceof Map)
      return Array.from(selects)
        .map(([alias, field]) => `${field} AS \`${alias}\``)
        .join(', ');

    if (selects instanceof Field)
      return selects.toString();

    if (selects instanceof Computed)
      return `${selects} AS value`;

    if (selects)
      throw new Error('Invalid select.');

    return 'COUNT(*)';
  }

  toWhere(conditions: Iterable<Syntax>, or?: boolean): string {
    return Array
      .from(conditions)
      .map((cond, i) => {
        if (cond[0] instanceof Syntax){
          const inner = this.toWhere(cond, !or);
          return cond.length == 1 || or !== false && !i ? inner : `(${inner})`;
        }

        return cond.toString();
      })
      .join(or ? ' OR ' : ' AND ');
  }

  toJoin(table: Query.Table){
    const { as, on } = table.join!;
    const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

    return ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
  }

  toUpdate(multiTableAllowed = false){
    const sets: string[] = [];

    if(this.updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    for(const [table, data] of this.updates)
      for(let [col, value] of Object.entries(data)){
        const field = table[col] as Field; 

        if(value === undefined)
          continue;

        if(value === null){
          if(field.nullable)
            value = 'NULL';
          else
            throw new Error(`Column ${field} is not nullable.`);
        }
        else if(value instanceof Field || value instanceof Computed)
          value = value.toString();
        else
          value = field.raw(value);

        sets.push(`\`${field.column}\` = ${value}`);
      }

    if(sets.length)
      return sets.join(', ');

    throw new Error('Update contains no values.');
  }
}

class Parameter {
  constructor(public index: number){}

  digest(value: any){
    return value;
  }

  toString(){
    return '?';
  }
}

class Value {
  constructor(public value: any){}

  toString(){
    const { value } = this;

    if(typeof value === 'string')
      return `'${value.replace(/'/g, "\\'")}'`;

    if(typeof value === 'function')
      return value();

    return value;
  }
}

export { Builder, Parameter, where };