import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Computed } from './Computed';
import { Query } from './Query';

type Selects = Field | Value | Computed<unknown>;

class Builder {
  connection!: Connection;

  /**
   * If running in template mode, this records the order by which
   * parameters are used in the template itself. This is used to
   * ensure that no parameters are duplicated or injected in the
   * wrong order.
   */
  params = new Set<Parameter>();
  arguments?: number;

  filters = new Group();
  pending = new Set<() => void>();
  orderBy = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: Map<string, Selects> | Selects;
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

    if(result)
      this.select(result);
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

    if(arg1 instanceof Group || typeof arg1 == "string")
      return this.andOr(...arguments);

    if(typeof arg1 == "number"){
      this.limit = arg1;
      return;
    }

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
      ...field.compare(this.filters),
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

    switch(typeof joinOn){
      case "object":
        for (const key in joinOn) {
          const left = table.local.get(key);
          const right = (joinOn as any)[key];

          if (left instanceof Field)
            joinsOn.add(left.compare().is(right));
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
    const query = [] as unknown[];
    const add = query.push.bind(query);

    const { deletes, limit, orderBy, tables, updates, filters } = this;
    const [ main, ...joins ] = tables.values();

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

    for(const table of joins)
      add(this.toJoin(table));

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

    if (selects)
      throw new Error('Invalid select.');

    return 'COUNT(*)';
  }

  toJoin(table: Query.Table){
    const { as, on } = table.join!;
    const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

    return ` ${kind} ${table} ON ${on}`;
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