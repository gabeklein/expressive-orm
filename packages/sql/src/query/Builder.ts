import { Connection } from '../connection/Connection';
import { Field, Syntax } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Computed } from './math';
import { Query } from './Query';

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

type Selects = Field | Value | Computed<unknown>;

export class Builder<T> {
  connection!: Connection;

  /**
   * If running in template mode, this records the order by which
   * parameters are used in the template itself. This is used to
   * ensure that no parameters are duplicated or injected in the
   * wrong order.
   */
  params?: Set<number>;

  wheres = new Set<Query.Compare>();
  pending = new Set<() => void>();
  orderBy = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: Map<string, Selects> | Selects;
  limit?: number;

  constructor(factory: Query.Function<T> | Query.Factory<T, any[]>){
    let result = factory(this.where.bind(this));

    if(typeof result === 'function'){
      const index = this.params = new Set();
      const params = Array.from(result as never, (_, i) => {
        return () => {
          if(index.has(i))
            throw new Error(`Parameter ${i} is already defined.`);
          else
            index.add(i);
  
          return "?";
        }
      })

      result = (result as Function)(...params); 
    }

    if(!this.connection)
      this.connection = Connection.None;

    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(!result)
      return;

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

  toRunner(){
    return this.connection.toRunner<T>(this);
  }

  /** Specify the limit of results returned. */
  private where(limit: number): void;

  /**
     * Accepts instructions for nesting in a parenthesis.
     * When only one group of instructions is provided, the statement are separated by OR.
     */
  private where(orWhere: Syntax[]): Syntax;

  /**
   * Accepts instructions for nesting in a parenthesis.
   * 
   * When multiple groups of instructions are provided, the groups
   * are separated by OR and nested comparisons are separated by AND.
   */
  private where(...orWhere: Syntax[][]): Syntax;

  /**
   * Create a reference to the primary table, returned
   * object can be used to query against that table.
   */
  private where<T extends Type>(entity: Type.EntityType<T>): Query.From<T>;

  /**
   * Registers a type as inner join.
   */
  private where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join?: "inner"): Query.Join<T>;

  /**
   * Registers a type as a left join, returned object has optional
   * properties which may be undefined where the join is not present.
   */
  private where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join: Query.Join.Mode): Query.Join.Left<T>;

  /**
   * Prepares write operations for a particular table.
   */
  private where<T extends Type>(field: Query.From<T>): Query.Verbs<T>;

  /**
   * Prepare comparison against a particilar field,
   * returns operations for the given type.
   */
  private where<T extends Field>(field: T): Query.Asserts<T>;

  private where(arg1: any, arg2?: any, arg3?: any): any {
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

    if(Array.isArray(arg1)){
      const local = [] as Query.Compare[];
      const args = Array.from(arguments) as Syntax[][];

      for(const group of args){
        group.forEach(eq => this.wheres.delete(eq));

        if(arguments.length > 1)
          local.push(group);
        else
          local.push(...group);
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
    const { deletes, limit, orderBy, tables, updates } = this;
    const [main, ...joins] = tables.values();

    let query;

    if(updates.size)
      query = `UPDATE ${main}`;
    else if(deletes.size){
      const [ target ] = deletes;
      const { alias, name } = tables.get(target)!;

      query = joins.length || alias
        ? `DELETE ${alias || name} FROM ${main}`
        : `DELETE FROM ${main}`;
    }
    else {
      query = 'SELECT ' + this.toSelect();
      
      if(main)
        query += ' FROM ' + main;
    }

    for (const table of joins){
      const { as, on } = table.join!;
      const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

      query += ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
    }

    query += this.toUpdate();
    query += this.toWhere();
  
    if (orderBy.size)
      query += ' ORDER BY ' +
        Array.from(orderBy).map(x => x.join(' ')).join(', ')
  
    if (limit)
      query += ` LIMIT ${limit}`;
  
    return query;
  }

  toWhere(){
    const { wheres } = this;

    if (!wheres.size)
      return '';

    function where(conditions: Query.Compare[], or?: boolean): string {
      return conditions.map(cond => {
        if(cond instanceof Syntax)
          return cond;

        if (Array.isArray(cond))
          return `(${where(cond, !or)})`;
      }).filter(Boolean).join(or ? ' OR ' : ' AND ');
    }

    return ' WHERE ' + where(Array.from(wheres.values()));
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
      return selects.toString() + ' AS value';

    if (selects)
      throw new Error('Invalid select.');

    return 'COUNT(*)';
  }

  toUpdate(multiTableAllowed = false){
    const sets: string[] = [];

    if(this.updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    for(const [table, data] of this.updates)
      for(let [col, value] of Object.entries(data)){
        const field = table[col] as Field; 

        if(value === null){
          if(field.nullable)
            value = 'NULL';
          else
            throw new Error(`Column ${field} is not nullable.`);
        }
        else if(value instanceof Field || value instanceof Computed)
          value = value.toString();
        else if(value !== undefined)
          value = field.set(value);
        else
          continue;

        sets.push(`\`${field.column}\` = ${value}`);
      }

    return sets.length ? ` SET ` + sets.join(', ') : "";
  }
}
