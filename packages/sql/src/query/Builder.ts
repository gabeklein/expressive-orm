import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { create, defineProperty, freeze, getOwnPropertyNames, values } from '../utils';
import { Query } from './Query';

interface Table<T extends Type = any> {
  toString(): string;
  name: string;
  proxy: Query.From<T>;
  local: Map<string, Field>;
  alias?: string;
  join?: {
    as: Query.Join.Mode;
    on: Group
  }
}

class Builder {
  connection!: Connection;

  /**
   * Parameters which will be sent with query.
   * May either be placeholders for a template, or values
   * which the query deems unsafe to interpolate directly.
   */
  params = new Set<Parameter>();

  filters = new Group();
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Table>();
  cte = new Map<string, Map<string, Parameter>>();

  deletes = new Set<Query.From<any>>();
  updates = new Map<Query.From<any>, Query.Update<any>>();
  selects?: unknown;
  limit?: number;

  commit(returns: unknown){
    if(this.selects)
      throw new Error('This query has already been committed.');

    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(!this.connection)
      this.connection = Connection.None;

    if(typeof returns === 'function')
      returns = returns();

    if(returns instanceof Field || returns instanceof Value){
      this.selects = returns;
    }
    else if(returns) {
      const columns = new Map<string, string | Field>();
        
      function scan(obj: any, path?: string) {
        getOwnPropertyNames(obj).forEach(key => {
          const use = path ? `${path}.${key}` : key;
          const selects = obj[key];
  
          if (selects instanceof Field)
            columns.set(use, selects);
          else if(selects instanceof Value)
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
  
      scan(returns);
  
      this.selects = columns;
    }

    return this.connection!.stringify(this);
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
      asc: () => { this.order.set(field, "asc") },
      desc: () => { this.order.set(field, "desc") }
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

  use<T extends Type>(type: Type.EntityType<T>): Query.From<T>;
  use<T extends Type>(type: Type.EntityType<T>, joinOn: Query.Join.On<T>, joinAs?: Query.Join.Mode): Query.Join<T>;
  use<T extends Type>(type: Type.EntityType<T>, joinOn?: Query.Join.On<T>, joinAs?: Query.Join.Mode){
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
    const table: Table = {
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
      field.query = this;
      field.toString = () =>
        `${table.alias || table.name}.${field.column}`;

      local.set(key, field);

      let value: any;

      defineProperty(proxy, key, {
        get: () => value || (
          value = field.use ? field.use(this) : field
        )
      });
    });

    freeze(proxy);

    if(joinOn){
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

      this.pending.add(() => {
        this.filters = joinsOn;
        switch(typeof joinOn){
          case "function":
            joinOn(left => {
              if(left instanceof Field)
                return left.where();
      
              throw new Error("Join assertions can only apply to fields.");
            });
          break;

          case "object":
            for (const key in joinOn) {
              const left = table.local.get(key);
      
              if (left instanceof Field)
                this.where(left, "=", joinOn[key]);
              else
                throw new Error(`${key} is not a valid column in ${type}.`);
            }
          break;
      
          default:
            throw new Error(`Invalid join on: ${joinOn}`);
        }
        this.filters = current;
      })
  
      table.join = {
        as: joinAs,
        on: joinsOn
      }
    }
    
    return table.proxy;
  }

  where(left: Field, op: string, right: unknown){
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
    const name = 'input';
    const proxy = {};

    for(const key of keys){
      defineProperty(proxy, key, {
        configurable: true,
        get(){
          const value = new Parameter(`${name}.${key}`);

          used.set(key, value);
          defineProperty(this, key, { value });
          return value;
        }
      });
    }

    this.cte.set(name, used);
    this.params.add(
      new Parameter(() => (
        Array.from(data, row => (
          Array.from(used, ([key, value]) => value.digest(row[key]))
        ))
      ))
    );

    this.tables.set(proxy, {
      name,
      proxy,
      local: new Map(),
      toString: () => name
    });

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
}

class Value {}

class Parameter extends Value {
  index = -1;

  constructor(index?: number);
  constructor(placeholder?: string);
  constructor(data?: () => unknown);
  constructor(arg?: number | string | (() => unknown)){
    super();

    if(typeof arg == "number")
      this.index = arg;
    else if(typeof arg == "function")
      this.data = arg;
    else if(typeof arg == "string")
      this.toString = () => arg;
  }

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

export { Builder, Parameter, Group, Value, Table };