
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

export class QueryBuilder {
  connection!: Connection;

  tables = new Map<{}, Query.Table>();
  pending = new Set<() => void>();
  parse?: (raw: any[]) => any[];

  deletes?: Query.From<any>;
  updates?: Readonly<[Query.From<any>, Query.Update<any>]>;
  selects?: unknown;

  limit?: number;
  orderBy = new Map<Field, "asc" | "desc">();
  wheres = new Set<Query.Compare>();

  extend(apply?: Partial<QueryBuilder>){
   return assign(create(this), apply) as QueryBuilder;
  }

  async send(){
    return this.connection.send(String(this));
  }

  use<T extends Type>(type: Type.EntityType<T>){
    const { fields, schema } = type;
    const { tables } = this;

    if(!this.connection){
      this.connection = type.connection || INERT;
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

  toSelect(){
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

  toString() {
    this.pending.forEach(fn => fn());
    this.pending.clear();

    const {
      limit,
      selects,
      tables,
      updates,
      deletes,
      orderBy,
      wheres
    } = this;

    const [{ name: main }, ...joins] = tables.values();

    let query;

    if(selects)
      query = `SELECT ${this.toSelect()} FROM ${main}`;
    else if(updates)
      query = `UPDATE ${main}`;
    else if(deletes){
      const { name } = this.tables.get(deletes)!;

      query = joins.length || name.alias
        ? `DELETE ${name} FROM ${main}`
        : `DELETE FROM ${main}`;
    }
    else
      query = `SELECT COUNT(*) FROM ${main}`;

    for (const table of joins){
      const { as, on } = table.join!;
      const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

      query += ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
    }

    if (updates) {
      const [table, data] = updates;
      const sets: string[] = [];
      
      Object.entries(data).forEach(([col, value]) => {
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
          return;

        sets.push(`\`${field.column}\` = ${value}`);
      })

      query += `\nSET ${sets.join(', ')}`;
    }

    if (wheres.size) {
      function buildWhere(conditions: Query.Compare[], or?: boolean): string {
        return conditions.map(cond => {
          if(cond instanceof Syntax)
            return cond;

          if (Array.isArray(cond))
            return `(${buildWhere(cond, !or)})`;

          return "";
        }).filter(Boolean).join(or ? ' OR ' : ' AND ');
      }
  
      query += ' WHERE ' + buildWhere(Array.from(wheres.values()));
    }
  
    if (orderBy.size)
      query += ' ORDER BY ' + Array
        .from(orderBy)
        .map(([field, dir]) => `${field} ${dir}`)
        .join(', ')
  
    if (limit)
      query += ` LIMIT ${limit}`;
  
    return query;
  }
}
