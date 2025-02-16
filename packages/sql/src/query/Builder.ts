import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Query } from './Query';

declare namespace Builder {
  interface Table<T extends Type = any> {
    toString(): string;
    name: string;
    proxy: Query.From<T>;
    fields: Map<string, Field>;
    alias?: string;
    optional?: boolean;
    joins: Cond[];
  }

  type Using<T extends Type> = (self: Query.From<T>, where: Query.Where) => void;

  type Insert = Map<Field, unknown>;
}

class Builder {
  /**
   * Parameters which will be sent with query.
   * May either be placeholders for a template, or values
   * which the query deems unsafe to interpolate directly.
   */
  params = [] as Parameter[];

  filters = new Group();
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.Table>();

  deletes = new Set<Query.Table>();
  updates = new Map<Query.Table, Builder.Insert>();
  inserts = new Map<Query.Table, Builder.Insert>();
  register = new Map<string, Field>();
  
  returns?: Map<string, Field | Value> | Field | Value;
  limit?: number;

  commit(returns: unknown){
    if(this.returns)
      throw new Error('This query has already been committed.');

    this.pending.forEach(fn => fn());
    this.pending.clear();

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
          let selects = obj[key];

          if(typeof selects == 'function')
            selects = selects();
  
          if (selects instanceof Field || selects instanceof Value || typeof selects != 'object')
            columns.set(use, selects);
          else
            scan(selects, use);
        })
      }
  
      scan(returns);
  
      this.returns = columns;
    }
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
        const inserts = new Map<Field, unknown>();

        Object.entries(data).forEach(([key, value]) => {
          const field = target.fields.get(key)!;

          if(value instanceof DataField)
            value.field = field;

          inserts.set(field, value);
        })

        this.updates.set(target, inserts);
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
      if(eq instanceof Cond && eq.restricted)
        throw new Error(
          `Cannot use ${eq.left} ${eq.op} ${eq.right} in a group.`
        );

      this.filters.delete(eq)
      local.add(eq); 
    }

    return local;
  }

  use<T extends Type>(type: Type.EntityType<T>, optional?: false): Query.From<T>;
  use<T extends Type>(type: Type.EntityType<T>, optional: boolean): Query.Join<T>;
  use<T extends Type>(type: Type.EntityType<T>, ...inserts: Type.Insert<T>[]): Query.From<T>;
  use<T extends Type>(type: Type.EntityType<T>, arg2?: boolean | Type.Insert<T>, ...rest: Type.Insert<T>[]){
    const { fields, schema } = type;
    const { tables } = this;

    const proxy = {} as Query.From<T>;
    const table: Builder.Table = {
      name: type.table,
      fields: new Map(),
      joins: [],
      proxy,
      optional: arg2 === true,
      toString(){
        return this.alias
          ? this.name + " " + this.alias
          : this.name;
      }
    };

    if(rest.length)
      arg2 = this.with<any>([arg2, ...rest]) as any;

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
      field.toString = () => `${table.alias || table.name}.${field.column}`;

      table.fields.set(key, field);
      this.register.set(uid(), field);

      let value: any;

      defineProperty(proxy, key, {
        get: () => value || (
          value = field.use ? field.use(this) : field
        )
      });
    });

    if(typeof arg2 == "object")
      this.insert(table, arg2);

    freeze(proxy);
    
    return table.proxy;
  }

  insert<T extends Type>(
    table: Builder.Table<T>,
    input: Type.Insert<T>){

    const inserts = new Map<Field, unknown>();
      
    for(const [key, field] of table.fields){
      let value = (input as any)[key];

      if(value instanceof DataField)
        value.field = field;
      else
        value = this.digest(value, field);

      if(value !== undefined)
        inserts.set(field, value);
    }

    this.inserts.set(table, inserts);
  }

  digest(value: any, field: Field){
    if (value != null)
      try {
        return field.set(value);
      }
      catch(err: unknown){
        let message = `Provided value for ${field.parent}.${field.column} but not acceptable for type ${field.datatype}.`;

        if(err instanceof Error){
          err.message = message + "\n" + err.message;
          throw err;
        }

        if(typeof err == "string")
          message += "\n" + err;

        throw new Error(message);
      }
    else if (!field.nullable && !field.optional && !field.increment)
      throw new Error(
        `Can't assign to \`${field.parent}.${field.property}\`. A value is required but got ${value}.`
      );
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
        right.field = left;
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

  with<T extends Record<string, any>>(data: Iterable<T>){
    return new DataTable(this, data).proxy;
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

export class DataField extends Value {
  field?: Field;

  constructor(
    public column: string,
    public table: DataTable){
    super();
  }

  get datatype(){
    return this.field?.datatype || "";
  }
}

class DataTable<T extends Record<string, unknown> = any>
  extends Parameter implements Builder.Table {

  proxy: { [K in keyof T]: Field<T[K]> };
  output: { [K in keyof T]: unknown }[] = [];

  used = new Set<DataField>();
  joins: Cond[] = [];
  optional = false;
  fields = new Map<string, Field>();
  name = "input";

  constructor(
    public parent: Builder,
    input: Iterable<T>){

    super();

    const proxy: any = {};
    const keys = new Set<string>();

    for(const item of input)
      Object.keys(item).forEach(keys.add, keys);
    
    for(const key of keys){
      const value = new DataField(key, this);

      defineProperty(proxy, key, {
        enumerable: true,
        get: () => {
          this.used.add(value);
          return value;
        }
      });
    }

    this.proxy = proxy;
    this.index = parent.params.length;

    parent.params.push(this);
    parent.tables.set(proxy, this);
    parent.pending.add(() => {
      Array.from(input, (entry, index) => {
        const emit = {} as any;
  
        for(const { column, field } of this.used){
          if(!field)
            throw new Error(`Field for input ${column} is not defined.`);

          try {
            emit[column] = this.parent.digest(entry[column], field);
          }
          catch(err: unknown){
            let message = `A provided value at \`${column}\` at index [${index}] is not acceptable.`;
      
            if(err instanceof Error){
              err.message = message + "\n" + err.message;
              throw err;
            }
      
            if(typeof err == "string")
              message += "\n" + err;
      
            throw new Error(message);
          }
        }

        this.output.push(emit);
      });
    });
  }

  toParam(): any {
    return Array.from(this.output, row => (
      Array.from(this.used, field => row[field.column])
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
    if(left instanceof Field)
      left = new Cond(left, op!, right!);
    
    this.children.add(left);

    return left;
  }

  delete(child: Cond | Group){
    this.children.delete(child);
  }

  get size(){
    return this.children.size;
  }
}

class QueryTemplate extends Value {
  parts: unknown[];

  constructor(public from: string, parent: Builder){
    super();
    this.parts = from
      .split(/(\0[a-zA-Z0-9]+)/)
      .filter(Boolean)
      .map(part => parent.register.get(part) || part);
  }
}

function uid(){
  return "\0" + Math.random().toString(32).slice(2, 7);
}

export {
  Builder,
  DataTable,
  Group,
  Parameter,
  QueryTemplate,
  Value,
};