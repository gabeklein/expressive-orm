import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Query } from './Query';

declare namespace Builder {
  interface Table<T extends Type = any> {
    toString(): string;
    name: string;
    proxy: Query.From<T>;
    reference: Record<string, Field>;
    alias?: string;
    optional?: boolean;
    joins: Cond[];
  }

  type Using<T extends Type> = (self: Query.From<T>, where: Query.Where) => void;
}

class Builder {
  connection!: Connection;

  /**
   * Parameters which will be sent with query.
   * May either be placeholders for a template, or values
   * which the query deems unsafe to interpolate directly.
   */
  params = [] as Parameter[];

  filters = new Group();
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Builder.Table>();

  deletes = new Set<Query.Table>();
  updates = new Map<Query.Table, Query.Update<any>>();
  returns?: Map<string, Field | Value> | Field | Value;
  limit?: number;

  commit(returns: unknown){
    if(this.returns)
      throw new Error('This query has already been committed.');

    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(!this.connection)
      this.connection = Connection.None;

    if(typeof returns === 'function')
      returns = returns();

    if(returns instanceof Field || returns instanceof Value){
      this.returns = returns;
    }
    else if(returns) {
      const columns = new Map<string, string | Field | Value>();
        
      function scan(obj: any, path?: string) {
        getOwnPropertyNames(obj).forEach(key => {
          const use = path ? `${path}.${key}` : key;
          const selects = obj[key];
  
          if (selects instanceof Field || selects instanceof Value)
            columns.set(use, selects);
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
  
      scan(returns);
  
      this.returns = columns;
    }

    return this.connection!.stringify(this);
  }

  inject(args: number){
    return Array.from({ length: args }, (_, i) => {
      const p = new Parameter(i);

      return () => {
        if(this.params.includes(p))
          throw new Error(`Parameter ${i} is already defined.`);
        else
          this.params.push(p);

        return p;
      }
    })
  }

  table(table: Query.From){
    const target = this.tables.get(table)!;

    return <Query.Verbs<Type>> {
      delete: () => {
        this.deletes.add(target);
      },
      update: (data: Query.Update<any>) => {
        Object.entries(data).forEach(([key, value]) => {
          if(value instanceof DataField)
            value.datatype = target.reference[key].datatype;
        })

        this.updates.set(target, data);
      }
    }
  }

  field<T extends Field>(field: T){
    return {
      ...field.where(),
      asc: () => { this.order.set(field, "asc") },
      desc: () => { this.order.set(field, "desc") }
    }
  }

  andOr(...args: (Cond | Group)[]){
    const local = new Group();

    this.filters.add(local);

    for(const eq of args){
      if(eq instanceof Cond && eq.restricted){
        const name = `${eq.left} ${eq.op} ${eq.right}`;
        throw new Error(`Cannot use ${name} in a group.`);
      }

      this.filters.delete(eq)
      local.add(eq); 
    }

    return local;
  }

  use<T extends Type>(type: Type.EntityType<T>, optional?: false): Query.From<T>;
  use<T extends Type>(type: Type.EntityType<T>, optional: boolean): Query.Join<T>;
  use<T extends Type>(type: Type.EntityType<T>, optional?: boolean){
    const { fields, schema } = type;
    const { tables } = this;

    if(!this.connection && type.connection){
      this.connection = type.connection;
    }
    else if(type.connection !== this.connection){
      const [ main ] = tables.values();
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}.`);
    }

    const reference = {} as Record<string, Field>;
    const proxy = {} as Query.From<T>;
    const table: Builder.Table = {
      name: type.table,
      joins: [],
      reference,
      proxy,
      optional,
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
      field.query = this;
      field.table = table;
      field.toString = () => {
        return `${table.alias || table.name}.${field.column}`;
      }

      defineProperty(reference, key, { value: field });

      let value: any;

      defineProperty(proxy, key, {
        get: () => value || (
          value = field.use ? field.use(this) : field
        )
      });
    });

    freeze(proxy);
    
    return table.proxy;
  }

  where(left: Field, op: string, right: unknown){
    if(typeof right == "function")
      right = right();

    if(right === null && !left.nullable)
      throw new Error(`Column ${left} is not nullable.`);

    if(right instanceof Field || right instanceof DataField){
      const where = new Cond(left, op, right, true);

      if(right instanceof DataField){
        // TODO: should generator handle this?
        right.datatype = left.datatype;
        right.table.joins.push(where);
      }
      else
        left.table!.joins.push(where);

      return where;
    }

    if(right instanceof Parameter){
      right.digest = left.set.bind(this);
    }

    return this.filters.add(left, op, right);
  }

  with(data: Iterable<Record<string, any>>){
    const param = new DataTable(data, this.params.length);

    this.params.push(param);
    this.tables.set(param.proxy, param);

    return param.proxy;
  }

  accept(args: unknown[]){
    return Array.from(this.params || [], p => p.toParam(args));
  }

  parse(raw: Record<string, any>){
    const { returns: selects } = this;

    if(selects instanceof Map){
      const values = {} as any;
      
      selects.forEach((field, column) => {
        const path = column.split('.');
        const property = path.pop()!;
        let target = values;

        for (const step of path)
          target = target[step] || (target[step] = {});

        const value = raw[column];

        target[property] = 
          field instanceof Field ? field.get(value) :
          selects instanceof Parameter ? selects.digest(value) :
          value;
      });

      return values;
    }

    const value = values(raw)[0];

    if(selects instanceof Parameter)
      return selects.digest(value);
    
    if(selects instanceof Field)
      return selects.get(value);

    return raw;
  }
}

class Value {}

export class DataField extends Value {
  datatype = "";

  constructor(
    public column: string,
    public table: DataTable){
    super();
  }
}

class Parameter extends Value {
  index = -1;

  constructor(index?: number);
  constructor(data?: () => unknown);
  constructor(arg?: number | (() => unknown)){
    super();

    if(typeof arg == "number")
      this.index = arg;
    else if(typeof arg == "function")
      this.toParam = arg;
  }

  digest(value: unknown){
    return value;
  }

  toParam(from: Record<string, any>){
    return this.digest(from[this.index]);
  }
}

class DataTable<T extends Record<string, unknown> = any>
  extends Parameter implements Builder.Table {

  proxy: T;
  used = new Map<keyof T & string, DataField>();
  joins: Cond[] = [];
  optional = false;
  reference = {};
  name = "input";

  constructor(public input: Iterable<T>, index: number){
    super();

    this.proxy = {} as T;
    this.index = index;

    new Set(([] as string[]).concat(
      ...Array.from(input, Object.keys))
    ).forEach(key => {
      const value = new DataField(key, this);
      defineProperty(this.proxy, key, {
        get: () => {
          this.used.set(key, value);
          return value;
        }
      });
    });
  }

  toParam(): any {
    return Array.from(this.input, row => (
      Array.from(this.used, ([key]) => row[key])
    ))
  }
}

export class Cond {
  constructor(
    public readonly left: Field, 
    public readonly op: string, 
    public readonly right: unknown,
    public readonly restricted = false
  ){}
}

class Group {
  children = new Set<Cond | Group>();

  add(left: Field | Group | Cond, op?: string, right?: unknown){
    const cond = left instanceof Field
      ? new Cond(left, op!, right!) : left;
    
    this.children.add(cond);

    return cond;
  }

  delete(child: Cond | Group){
    this.children.delete(child);
  }

  get size(){
    return this.children.size;
  }
}

export { Builder, Parameter, Group, Value, DataTable };