import { Field } from '../type/Field';
import { defineProperty } from '../utils';
import { Builder } from './Builder';

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

class DataField extends Value {
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
  extends Parameter implements Builder.ITable {

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

type Expression = Cond | Group;

class Cond {
  constructor(
    public readonly left: Field, 
    public readonly op: string, 
    public readonly right: unknown,
    public readonly restricted = false
  ){}
}

class Group {
  children = new Set<Expression>();

  add(left: Field | Expression, op?: string, right?: unknown){
    if(left instanceof Field)
      left = new Cond(left, op!, right!);
    
    this.children.add(left);

    return left;
  }

  delete(child: Expression){
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

export {
  Value,
  Parameter,
  DataField,
  DataTable,
  Cond,
  Group,
  QueryTemplate,
  Expression
}