import knex, { Knex } from 'knex';

import { Field } from './Field';
import { isTypeConstructor, Type } from './Type';

const RelevantTable = new WeakMap<{}, Table>();

declare const ENTITY: unique symbol;
declare const JOINS: unique symbol;

interface Table<T extends Type = Type> {
  type: Type.EntityType<T>;
  query: QueryBuilder;
  name: string | Knex.AliasDict;
  alias?: string;
  proxy: Query.From<T>;
}

declare namespace Query { 
  interface Where {
    /**
     * Accepts instructions for nesting in a parenthesis.
     * When only one group of instructions is provided, the statement are separated by OR.
     **/
    (orWhere: Instructions): Instruction;

    /**
     * Accepts instructions for nesting in a parenthesis.
     * 
     * When multiple groups of instructions are provided, the groups
     * are separated by OR and nested comparisons are separated by AND.
     */
    (...orWhere: Instructions[]): Instruction;
  
    /** Create a reference to the primary table, returned object can be used to query against that table. */
    <T extends Type>(entity: Type.EntityType<T>): From<T>;
  
    /** Registers a type as a inner join. */
    <T extends Type>(entity: Type.EntityType<T>, on: Join.On<T>, join?: "inner"): Join<T>;

    /** Registers a type as a left join, returned object has optional properties which may be undefined where the join is not present. */
    <T extends Type>(entity: Type.EntityType<T>, on: Join.On<T>, join: Join.Mode): LeftJoin<T>;

    /** Prepares write operations for a particular table. */
    <T extends Type>(field: From<T>): Verbs<T>;
    
    /** Prepare comparison against a particilar field, returns operations for the given type. */
    <T>(field: T): Assert<T>;
  }

  type From<T extends Type = Type> = {
    [K in Type.Field<T>]: Exclude<T[K], null>;
  } & {
    [ENTITY]?: T
  }

  namespace Join {
    type Mode = "left" | "inner";

    type Where = (field: Field) => {
      is(equalTo: Field): void;
      isNot(equalTo: Field): void;
      isMore(than: Field): void;
      isLess(than: Field): void;
    }

    type Function = (on: Where) => void;

    type Object<T extends Type> = {
      [K in Type.Field<T>]?: T[K];
    }

    type On<T extends Type = any> = Object<T> | Function;
  }

  type Join<T extends Type> = From<T> & {
    [JOINS]?: "inner"
  };

  type LeftJoin<T extends Type> = Compat<T> & {
    [ENTITY]?: T
    [JOINS]?: "left"
  }

  /** A query instruction returned by assertions which can be nested. */
  type Instruction = (or?: boolean) => void;

  /** A group of query instructions declared within parenthesis. */
  type Instructions  = Instruction[];

  interface Compare<T> {
    is(equalTo: T): Instruction;
    isNot(equalTo: T): Instruction;
    isMore(than: T): Instruction;
    isLess(than: T): Instruction;
  }

  interface Assert<T> extends Compare<T> {
    isAsc(): void;
    isDesc(): void;
  }

  interface Verbs <T extends Type> {
    delete(): void;
    update(values: Query.Update<T>): void;
  }

  type Compat<T extends Type> = {
    [K in Type.Field<T>]?: T[K];
  }

  // TODO: make this default/nullable aware.
  type Update<T extends Type> = {
    [K in Type.Field<T>]?: Exclude<T[K], undefined>;
  }

  type Function<R> = (where: Where) => R;

  type Template<A, R> = (where: Where, ...args: A[]) => R;
}

interface Query<T = unknown> extends PromiseLike<T> {
  /**
   * Counts the number of rows that would be selected.
   **/
  count(): Promise<number>;

  /**
   * Returns the SQL string generated by this query.
   */
  toString(): string;
}

interface SelectQuery<T = unknown> extends Query<T[]> {
  /**
   * Returns the first rows which match creteria.
   * 
   * @param limit The maximum number of rows to return.
   */
  get(limit?: number): Promise<T[]>;

  /**
   * Returns the first row that matches creteria.
   * 
   * @param orFail If true, will throw an error if no results are returned.
   */
  one(orFail?: boolean): Promise<T>;
}

function Query<T extends Type>(from: Query.Function<Query.From<T>>): SelectQuery<T>;

function Query<T extends {}>(from: Query.Function<T>): SelectQuery<T>;

/**
 * Creates a new query.
 * 
 * If no selection is returned by the constructor, will return
 * the number of rows that would be selected or modified.
 */
function Query(from: Query.Function<void>): Query<number>;

function Query<T = void>(constructor: Query.Function<T>): Query | SelectQuery {
  const builder = new QueryBuilder();
  const selects = builder.where(constructor);
  const query = {
    then(resolve: (res: any) => any, reject: (err: any) => any){
      return builder.get().then<T[]>(resolve).catch(reject);
    },
    count: () => builder.count(),
    toString: () => builder.toString()
  }

  if(!selects)
    return query;

  return {
    ...query,
    get(limit?: number){
      return builder.get(limit);
    },
    async one(orFail?: boolean){
      const res = await builder.get(1);
  
      if(res.length == 0 && orFail)
        throw new Error("Query returned no results.");
  
      return res[0] as T;
    }
  }
}

Query.one = function one<T extends {}>(
  where: Query.Function<T>, orFail?: boolean){

  return Query(where).one(orFail);
}

class QueryBuilder {
  builder!: Knex.QueryBuilder;
  tables = [] as Table[];
  pending = new Set<Query.Instruction>();
  parse?: (raw: any[]) => any[];

  toString(){
    return this.builder.toString().replace(/```/g, "`");
  }

  where<T>(fn: Query.Function<T>){
    const self = this;

    function where(type: any, on?: any, joinMode?: any){
      if(Array.isArray(type))
        return self.andOr(...arguments)

      if(isTypeConstructor(type))
        return self.table(type, on, joinMode);
  
      if(Field.is(type))
        return {
          is: self.compare(type, "="),
          isNot: self.compare(type, "<>"),
          isMore: self.compare(type, ">"),
          isLess: self.compare(type, "<"),
          isAsc: self.orderBy(type, "asc"),
          isDesc: self.orderBy(type, "desc"),
        }

      const table = RelevantTable.get(type);
  
      if(!table)
        throw new Error(`Argument ${type} is not a query argument.`);
  
      return <Query.Verbs<Type>> {
        delete: () => {
          self.builder.table(table.name).delete();
        },
        update: (data: Query.Update<any>) => {
          data = table.type.digest(data);
          self.builder.table(table.name).update(data);
        }
      }
    }

    const selects = fn(where as any);

    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(selects){
      this.select(selects);
      return true;
    }

    this.builder.count();
    return false;
  }

  private select(selects: unknown){
    if(Field.is(selects)){
      const name = selects.column;
  
      this.builder.select({ [name]: String(selects) });
      this.parse = raw => raw.map(({ [name]: value }) => (
        selects.get ? selects.get(value) : value
      ));

      return
    }
    
    if(typeof selects != "object")
      throw new Error("Invalid selection.");
      
    const output = new Map<string | Field, string | number>();

    Object.getOwnPropertyNames(selects).forEach(key => {
      const value = (selects as any)[key];
    
      if(Field.is(value)){
        output.set(value, key);
        this.builder.select({ [key]: String(value) });
      }
    })

    this.parse = raw => raw.map(row => {
      const values = Object.create(selects as {});
    
      output.forEach((column, value) => {
        if(Field.is(value) && value.get)
          value = value.get(row[column]);

        Object.defineProperty(values, column, { value });
      })
        
      return values;
    })
  }

  andOr(...args: Query.Instructions[]){
    for(const group of args)
      for(const fn of group)
        this.pending.delete(fn);

    const apply = () => {
      const orGroup = args.length > 1;
      const current = this.builder;

      args.forEach((group, i) => {
        this.builder[i > 0 ? "orWhere" : "where"](context => {
          this.builder = context;
          group.forEach(fn => fn(!orGroup));
          this.builder = current;
        })
      });
    }

    this.pending.add(apply);

    return apply;
  }

  compare(type: Field, op: string) {
    return (right: unknown) => {
      const apply = (or?: boolean) => {
        const r = typeof right === "number" ? right : String(right);
        this.builder[or ? "orWhere" : "where"](String(type), op, r);
      }

      this.pending.add(apply);

      return apply;
    };
  }

  orderBy(field: Field, direction: "asc" | "desc"){
    return () => {
      this.builder.orderBy(String(field), direction);
    }
  }

  async get(limit?: number): Promise<any[]> {
    let execute = this.builder;

    if(limit)
      execute = execute.clone().limit(limit);

    if(this.parse)
      return execute.then(this.parse);

    return await execute;
  }

  async count(){
    return this.builder.clone().clearSelect().count();
  }

  table<T extends Type>(
    type: Type.EntityType<T>, 
    on?: Query.Join.On<any>,
    joinMode?: Query.Join.Mode
  ){
    if(typeof on == "string")
      throw new Error("Bad parameters.");

    let { fields, schema } = type;
    let name: string | Knex.AliasDict = type.table
    let alias: string | undefined;

    if(schema){
      alias = `$${this.tables.length}`;
      name = { [alias]: schema + '.' + name };
    }

    const proxy = {} as any;
    const table: Table<T> = {
      name,
      alias,
      type,
      proxy,
      query: this
    };

    RelevantTable.set(proxy, table);

    fields.forEach((field, key) => field.query(table, key));

    Object.freeze(proxy);

    const main = this.tables[0];

    if(main){
      if(type.connection !== main.type.connection)
        throw new Error(`Joined entity ${type} does not share a connection with main table ${main}`);
  
      let callback: Knex.JoinCallback;
  
      if (typeof on === "function")
        callback = (table) => {
          this.pending.add(() => {
            on(field => {
              if (!Field.is(field))
                throw new Error("Join assertions can only apply to fields.");
  
              const on = (op: string) => (right: Field) => {
                table.on(String(field), op, String(right));
              };
  
              return {
                is: on("="),
                isNot: on("<>"),
                isMore: on(">"),
                isLess: on("<"),
              }
            });
          })
        }
      else if (typeof on === "object")
        callback = (table) => {
          for (const key in on) {
            const field = type.fields.get(key);
    
            if (!field)
              throw new Error(`${key} is not a valid field in ${type}.`);
    
            const left = `${type.table}.${field.column}`;
            const right = String(on[key]);
    
            table.on(left, "=", right);
          }
        }
      else
        throw new Error(`Invalid join on: ${on}`);
  
      switch(joinMode){
        case undefined:
        case "inner":
          this.builder.join(name, callback);
          break;
  
        case "left":
          this.builder.leftJoin(name, callback);
          break;
  
        case "right" as unknown:
        case "full" as unknown:
          throw new Error(`Cannot ${joinMode} join because that would affect ${main} which is already defined.`);
  
        default:
          throw new Error(`Invalid join type ${joinMode}.`);
      }
    }
    else {
      const engine = type.connection?.knex || knex({
        client: "sqlite3",
        useNullAsDefault: true,
        pool: { max: 0 }
      });

      this.builder = engine(name)
    }

    this.tables.push(table);

    return proxy;
  }
}

export { Query, SelectQuery, Table };