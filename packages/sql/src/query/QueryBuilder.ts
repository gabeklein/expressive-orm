
import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { assign, create, defineProperty, freeze, getOwnPropertyNames } from '../utils';
import { Computed } from './math';
import { Query } from './Query';
import { sql, Syntax } from './syntax';

const INERT = new Connection([], {
  client: "sqlite3",
  useNullAsDefault: true,
  pool: { max: 0 }
})

export class QueryBuilder<T = unknown> {
  connection!: Connection;

  tables = new Map<{}, Query.Table>();
  pending = new Set<() => void>();
  parse?: (raw: any[]) => any[];
  template = "";

  delete?: Query.Table;
  update?: Readonly<[Query.Table, Query.Update<any>]>;
  selects?: T;

  limit?: number;
  orderBy = new Map<Field, "asc" | "desc">();
  wheres = new Set<Query.Compare>();

  extend(apply?: Partial<QueryBuilder>){
   return assign(create(this), apply) as QueryBuilder;
  }

  async send(){
    return this.connection.send(String(this));
  }

  public use<T extends Type>(type: Type.EntityType<T>){
    const { fields, schema } = type;
    const { tables } = this;

    if(!this.connection){
      this.connection = type.connection || INERT;
    }
    else if(type.connection !== this.connection){
      const [ main ] = tables.values();
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}.`);
    }

    let name: string = type.table;
    let alias: string | undefined;

    if(schema){
      alias = 'T' + tables.size;
      name = schema + '.' + name;
    }

    const proxy = {} as Query.From<T>;

    fields.forEach((field, key) => {
      let value: any;
      defineProperty(proxy, key, {
        get(){
          if(!value){
            const local: typeof field = create(field);
            local.table = table;
            value = local.proxy ? local.proxy(table) : local; 
          }

          return value;
        }
      });
    });

    const table: Query.Table<T> = {
      alias,
      name,
      type,
      proxy,
      query: this,
      toString: () => alias || name
    };

    freeze(proxy);
    tables.set(proxy, table);

    return table;
  }

  public join<T extends Type>(
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
          const left = (table.proxy as any)[key];
          const right = (joinOn as any)[key];
  
          if (left instanceof Field)
            joinsOn.add(sql(left, "=", right));
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

  private toSelect(){
    const { selects } = this;

    if (selects instanceof Field){
      this.parse = raw => raw.map(row => selects.get(row[selects.column]));
      return selects;
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

    scan(selects);

    this.parse = raw => raw.map(row => {
      const values = {} as any;
      
      columns.forEach((field, column) => {
        const path = column.split('.');
        const prop = path.pop()!;
        let target = values;

        for (const step of path)
          target = target[step] || (target[step] = {});

        target[prop] = field.get(row[column]);
      });

      return values;
    })

    return Array.from(columns.entries())
      .map(([alias, field]) => `${field} AS \`${alias}\``)
      .join(', ');
  }

  public toString() {
    for (const fn of this.pending){
      this.pending.delete(fn);
      fn();
    }

    const { limit, selects } = this;
    const tables = this.tables.values();
    const [ main ] = tables;
    let sql = '';

    if(selects){
      const selects = this.toSelect();
      sql = `SELECT ${selects} FROM ${main}`;
    }
    else if (this.delete) {
      sql = `DELETE FROM ${this.delete}`;
    }
    else if (this.update) {
      const [table, data] = this.update;
      const updates = table.type.digest(data);
      const sets = Object
        .entries(updates)
        .map(([col, val]) => `\`${col}\` = ${typeof val === 'string' ? `'${val}'` : val}`)
        .join(', ');

      sql = `UPDATE ${table} SET ${sets}`;
    }
    else {
      let { alias, name } = main;

      if(alias)
        name = `${name} AS ${alias}`;

      sql = `SELECT COUNT(*) FROM ${name}`;
    }

    for (const table of tables)
      if (table.join) {
        const { as, on } = table.join;
        const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

        sql += ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
      }

    if (this.wheres.size) {
      function buildWhere(conditions: Query.Compare[], or?: boolean): string {
        return conditions.map(cond => {
          if(cond instanceof Syntax)
            return cond;

          if (Array.isArray(cond))
            return `(${buildWhere(cond, !or)})`;

          return "";
        }).filter(Boolean).join(or ? ' OR ' : ' AND ');
      }
  
      sql += ' WHERE ' + buildWhere(Array.from(this.wheres.values()));
    }
  
    if (this.orderBy.size)
      sql += ' ORDER BY ' + Array
        .from(this.orderBy)
        .map(([field, dir]) => `${field} ${dir}`)
        .join(', ')
  
    if (limit)
      sql += ` LIMIT ${limit}`;
  
    return sql;
  }
}
