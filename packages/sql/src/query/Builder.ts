import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Computed } from './Computed';
import { Query } from './Query';

class Builder {
  connection!: Connection;

  /**
   * Parameters which will be sent with query.
   * May either be placeholders for a template, or values
   * which the query deems unsafe to interpolate directly.
   */
  params = new Set<Parameter>();

  /** Number of external arguments this query expects. */
  arguments?: number;

  filters = new Group();
  pending = new Set<() => void>();
  orderBy = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();
  cte = new Map<string, Parameter>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: unknown;
  limit?: number;

  constructor(factory: Query.Function<unknown> | Query.Factory<unknown, any[]>){
    let result = factory.call(this, this.where.bind(this));

    if(typeof result === 'function'){
      this.arguments = result.length;
      const params = Array.from(result as { length: number }, (_, i) => {
        const p = new Parameter(i);

        return () => {
          if(this.params.has(p))
            throw new Error(`Parameter ${i} is already defined.`);
          else
            this.params.add(p);

          return p;
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

    if(result instanceof Field || result instanceof Computed){
      this.selects = result;
      return;
    }

    const columns = new Map<string, string | Field>();
      
    function scan(obj: any, path?: string) {
      getOwnPropertyNames(obj).forEach(key => {
        const use = path ? `${path}.${key}` : key;
        const selects = obj[key];

        if (selects instanceof Field)
          columns.set(use, selects);
        else if(selects instanceof Computed || selects instanceof Parameter)
          columns.set(use, String(selects));
        else if (typeof selects === 'object')
          scan(selects, use);
        else {
          columns.set(use, 
            typeof selects === 'function' ?
              selects() :
            typeof selects === 'string' ?
              `'${selects.replace(/'/g, "\\'")}'` :
            selects
          );
        }
      })
    }

    scan(result);

    this.selects = columns;
  }

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

  /**
   * Accepts other where() assertions for nesting in parenthesis.
   * 
   * Will alternate between AND-OR depending on depth, starting with OR.
   * 
   */
  private where(...orWhere: (string | Group)[]): Group;

  private where<T extends {}>(data: Iterable<T>): { [K in keyof T]: Field<T[K]> };

  /** Specify the limit of results returned. */
  private where(limit: number): void;

  private where(this: Builder, arg1: any, arg2?: any, arg3?: any): any {
    if(arg1 instanceof Field)
      return this.field(arg1);

    if(Type.is(arg1))
      return arg2
        ? this.join(arg1, arg2, arg3)
        : this.use(arg1).proxy;

    if(this.tables.has(arg1))
      return this.table(arg1);

    if(typeof arg1 == "string" || arg1 instanceof Group)
      return this.andOr(...arguments);

    if(typeof arg1 == "number"){
      this.limit = arg1;
      return;
    }

    if(Symbol.iterator in arg1) 
      return this.with(arg1);

    throw new Error(`Argument ${arg1} is not a query argument.`);
  }

  table(table: Query.From){
    return <Query.Verbs<Type>> {
      delete: () => {
        this.deletes.add(table);
      },
      update: (data: Query.Update<any>) => {
        this.updates.set(table, data);
      }
    }
  }

  field<T extends Field>(field: T){
    return {
      ...field.where(),
      asc: () => { this.orderBy.set(field, "asc") },
      desc: () => { this.orderBy.set(field, "desc") }
    }
  }

  andOr(...args: (string | Group)[]){
    const local = new Group();

    this.filters.add(local);

    for(const eq of args){
      this.filters.delete(eq)
      local.add(eq); 
    }

    return local;
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
    
    const joinsOn = new Group();
    const current = this.filters;

    switch(typeof joinOn){
      case "object":
        this.filters = joinsOn;
        for (const key in joinOn) {
          const left = table.local.get(key);
          const right = (joinOn as any)[key];

          if (left instanceof Field)
            this.compare(left, "=", right);
          else
            throw new Error(`${key} is not a valid column in ${type}.`);
        }
        this.filters = current;
      break;

      case "function":
        this.pending.add(() => {
          this.filters = joinsOn;
          joinOn(left => {
            if(left instanceof Field)
              return left.where();

            throw new Error("Join assertions can only apply to fields.");
          });
          this.filters = current;
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

  compare(left: Field, op: string, right: unknown){
    if(typeof right == "function")
      right = right();

    if(right instanceof Parameter){
      right.digest = left.set.bind(this);
      right = right.toString();
    }
    else if(Array.isArray(right)){
      right = `(${right.map(left.raw, left)})`;
    }
    else if(!(right instanceof Field)){
      right = left.raw(right);
    }

    const e = `${left} ${op} ${right}`;
    this.filters.add(e);
    return e;
  }

  with(data: Iterable<Record<string, any>>){
    const keys = new Set(([] as string[]).concat(...Array.from(data, Object.keys)));
    const used = new Map<string, Parameter>();
    const proxy = {};
    const name = 'cte';

    for(const key of keys){
      defineProperty(proxy, key, {
        configurable: true,
        get(){
          const value = new Parameter();

          used.set(key, value);
          value.toString = () => `${name}.${key}`;
          defineProperty(this, key, { value });
          return value;
        }
      });
    }

    const master = new Parameter();

    master.toString = () =>
      `SELECT ${
        Array.from(used, ([key], i) => `value -> ${i} AS ${key}`)
      } FROM json_each(?)`

    master.data = () =>
      Array.from(data, row => (
        Array.from(used, ([key, value]) => value.digest(row[key]))
      ));

    this.cte.set(name, master);
    this.params.add(master);

    const table: Query.Table = {
      name,
      proxy,
      local: new Map(),
      toString: () => name
    };

    this.tables.set(proxy, table);

    return proxy;
  }

  accept(args: unknown[]){
    return Array.from(this.params || [], p => p.data(args));
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
    const query = [] as unknown[];
    const add = query.push.bind(query);

    const { deletes, limit, orderBy, tables, updates, filters, cte } = this;
    const [ main, ...joins ] = tables.values();


    if(cte.size)
      add('WITH', Array.from(cte, ([name, param]) => `${name} AS (${param})`));

    if(updates.size){
      add("UPDATE", main);
    }
    else if(deletes.size){
      const [ target ] = deletes;
      const { alias, name } = tables.get(target)!;

      add("DELETE");

      if(tables.size > 1 || alias)
        add(alias || name);

      add('FROM', name);
    }
    else {
      add('SELECT', this.toSelect());
      
      if(main)
        add('FROM', main);
    }

    for(const table of joins){
      const { as, on } = table.join!;
      add(as.toUpperCase(), "JOIN", table, 'ON', on);
    }

    if(updates.size)
      add('SET', this.toUpdate());

    if(filters.size)
      add('WHERE', filters);
  
    if(orderBy.size)
      add('ORDER BY', Array.from(orderBy).map(x => x.join(' ')));
  
    if(limit)
      add('LIMIT', limit);
  
    return query.join(' ');
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

    if (!selects)
      return 'COUNT(*)';

    throw new Error('Invalid select.');
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
  constructor(public index = -1){}

  digest(value: unknown){
    return value;
  }

  data(from: Record<string, any>){
    return this.digest(from[this.index]);
  }

  toString(){
    return '?';
  }
}

class Group {
  children = new Set<string | Group>();

  add(child: string | Group){
    this.children.add(child);
  }

  delete(child: string | Group){
    this.children.delete(child);
  }

  get size(){
    return this.children.size;
  }

  toString(or?: boolean): string {
    return Array
      .from(this.children)
      .map((cond, i) => {
        if(typeof cond == "string")
          return cond;

        const inner = cond.toString(!or);
        const first = or !== false && i === 0;

        return cond.size == 1 || first ? inner : `(${inner})`;
      })
      .join(or ? ' OR ' : ' AND ')
  }
}

export { Builder, Parameter, Group };