import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { assign, create, defineProperty, freeze, getOwnPropertyNames } from '../utils';
import { Computed } from './math';
import { Query } from './Query';
import { sql, Syntax } from './syntax';

export class Builder<T> {
  connection!: Connection;

  wheres = new Set<Query.Compare>();
  pending = new Set<() => void>();
  orderBy = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: Map<string, Field | Computed<unknown>> | Field | Computed<unknown>;
  limit?: number;

  constructor(factory: Query.Function<T>){
    this.select(factory(this.where.bind(this)));
  }

  extend(apply?: Partial<this>){
    return assign(create(this), apply) as this;
  }

  async execute(): Promise<any> {
    return this.parse(await this.connection.send(String(this)));
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

  select(result: unknown){
    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(!result)
      return;

    if(result instanceof Field || result instanceof Computed){
      this.selects = result;
      return;
    }

    const columns = new Map<string, Field | Computed<unknown>>();
      
    function scan(obj: any, path?: string) {
      getOwnPropertyNames(obj).forEach(key => {
        const select = obj[key];
        const use = path ? `${path}.${key}` : key;

        if (select instanceof Field || select instanceof Computed)
          columns.set(use, select);
        else if (typeof select === 'object')
          scan(select, use);
      })
    }

    scan(result);

    this.selects = columns;
  }

  use<T extends Type>(type: Type.EntityType<T>){
    const { fields, schema } = type;
    const { tables } = this;

    if(!this.connection){
      this.connection = type.connection;
    }
    else if(type.connection !== this.connection){
      const [ main ] = tables.values();
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}.`);
    }

    const name: Query.Table.Ref = {
      id: type.table,
      toString(){
        return this.alias ? this.id + " " + this.alias : this.id;
      }
    }

    if(schema){
      name.alias = 'T' + tables.size;
      name.id = schema + '.' + name.id;
    }

    const local = new Map<string, Field>();
    const proxy = {} as Query.From;
    const table: Query.Table = {
      name,
      proxy,
      local,
      toString: () => name.alias || name.id
    };

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
            joinsOn.add(sql(left, "=", right instanceof Field ? right : left.set(right)));
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

  parse(raw: any[]){
    const { selects } = this;

    if(!selects)
      return raw;

    if(selects instanceof Map)
      return raw.map(row => {
        const values = {} as any;
        
        selects.forEach((field, column) => {
          const path = column.split('.');
          const property = path.pop()!;
          let target = values;

          for (const step of path)
            target = target[step] || (target[step] = {});

          target[property] = field.get(row[column]);
        });

        return values;
      });

    return raw.map(row => selects.get(row[selects.column]));
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
      return selects.toString() + ' AS ' + selects.column;

    if (selects)
      throw new Error('Invalid select statement.');

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

  toString() {
    const { deletes, limit, orderBy, tables, updates, wheres } = this;
    const [{ name: main }, ...joins] = tables.values();

    let query;

    if(updates.size)
      query = `UPDATE ${main}`;
    else if(deletes.size){
      const [ target ] = deletes;
      const { name } = this.tables.get(target)!;

      query = joins.length || name.alias
        ? `DELETE ${name} FROM ${main}`
        : `DELETE FROM ${main}`;
    }
    else
      query = `SELECT ${this.toSelect()} FROM ${main}`;

    for (const table of joins){
      const { as, on } = table.join!;
      const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

      query += ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
    }

    query += this.toUpdate();

    if (wheres.size) {
      function buildWhere(conditions: Query.Compare[], or?: boolean): string {
        return conditions.map(cond => {
          if(cond instanceof Syntax)
            return cond;

          if (Array.isArray(cond))
            return `(${buildWhere(cond, !or)})`;
        }).filter(Boolean).join(or ? ' OR ' : ' AND ');
      }
  
      query += ' WHERE ' + buildWhere(Array.from(wheres.values()));
    }
  
    if (orderBy.size)
      query += ' ORDER BY ' +
        Array.from(orderBy).map(x => x.join(' ')).join(', ')
  
    if (limit)
      query += ` LIMIT ${limit}`;
  
    return query;
  }
}
