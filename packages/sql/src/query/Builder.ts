import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Table } from '../type/Table';
import { assign, create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Query } from './Query';
import { Cond, DataField, DataTable, Expression, Group, Parameter, Value } from './Value';

declare namespace Builder {
  interface ITable<T extends Table = any> {
    toString(): string;
    name: string;
    proxy: Query.From<T>;
    fields: Map<string, Field>;
    alias?: string;
    optional?: boolean;
    joins: Cond[];
  }

  type Using<T extends Table> = (self: Query.From<T>, where: Query.Where) => void;

  type Insert = Map<Field, unknown>;
}

class Builder {
  connection?: Connection;

  /**
   * Parameters which will be sent with query.
   * May either be placeholders for a template, or values
   * which the query deems unsafe to interpolate directly.
   */
  params = [] as Parameter[];

  filters = new Group();
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Query.ITable>();

  deletes = new Set<Query.ITable>();
  updates = new Map<Query.ITable, Builder.Insert>();
  inserts = new Map<Query.ITable, Builder.Insert>();
  register = new Map<string, Field>();
  
  returns?: Map<string, Field | Value> | Field | Value;
  limit?: number;

  prepare(): Query.TemplateSelects<any, any> | Query.Template<any> {
    const conn = this.connection || Connection.None;
    const statement = conn.prepare(this);
    
    const runner = (...params: any[]) => {
      params = this.accept(params);

      const get = () => statement.all(params).then(a => a.map(x => this.parse(x)));
      const query = create(Query.prototype) as Query;
  
      assign(query, {
        params,
        toString: statement.toString,
        then: (resolve, reject) => {
          const run = this.returns ? get() : statement.run(params);
          return run.then(resolve).catch(reject);
        }
      } as Query);

      if (this.returns)
        assign(query, {
          get,
          one: async (orFail?: boolean) => {
            const res = await get();

            if (res.length)
              return res[0];

            if (orFail)
              throw new Error("Query returned no results.");
          }
        });
  
      return query;
    };

    return Object.assign(runner, {
      connection: conn,
      toString: statement.toString
    });
  }

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

    return <Query.Verbs<Table>> {
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

  compare<T extends Field>(field: T){
    const use = (op: string) =>
      (right: unknown, orEqual?: boolean) =>
        this.where(field, orEqual ? op + '=' : op, right)

    return {
      equal: use("="),
      in: use("IN"),
      not: use("<>"),
      over: use(">"),
      under: use("<")
    }
  }

  field<T extends Field>(field: T){
    return {
      ...this.compare(field),
      asc: () => { this.order.set(field, "asc") },
      desc: () => { this.order.set(field, "desc") }
    }
  }

  andOr(...args: Expression[]){
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

  use<T extends Table>(type: Table.Type<T>, optional?: false): Query.From<T>;
  use<T extends Table>(type: Table.Type<T>, optional: boolean): Query.Join<T>;
  use<T extends Table>(type: Table.Type<T>, ...inserts: Table.Insert<T>[]): Query.From<T>;
  use<T extends Table>(type: Table.Type<T>, arg2?: boolean | Table.Insert<T>, ...rest: Table.Insert<T>[]){
    if(!this.connection){
      this.connection = type.connection!;
    }
    else if(this.connection !== type.connection)
      throw new Error(
        `Joined entity ${type} does not share a connection with other tables in Query.`
      );
    
    const { fields, schema } = type;
    const { tables } = this;

    const proxy = {} as Query.From<T>;
    const table: Builder.ITable = {
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

  insert<T extends Table>(
    table: Builder.ITable<T>,
    input: Table.Insert<T>){

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
      right.digest = left.set.bind(left);
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

        if(value === undefined)
          return;

        target[property] = 
          value === null && field instanceof Field && field.nullable ? null :
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

function uid(){
  return "\0" + Math.random().toString(32).slice(2, 7);
}

export {
  Builder
};