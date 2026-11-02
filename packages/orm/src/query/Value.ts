import { Field } from '../Field';
import type { Builder } from './Builder';

class Value {}

function render(value: unknown): string {
  return value instanceof Value || value instanceof Field
    ? String(value)
    : String(JSON.stringify(value));
}

class Parameter extends Value {
  constructor(public index = -1){
    super();
  }

  digest(value: unknown){
    return value;
  }

  toParam(from: Record<string, any>){
    return this.digest(from[this.index]);
  }

  toString(){
    return "$" + this.index;
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

  toString(){
    return `${this.table.name}.${this.column}`;
  }
}

class DataTable<T extends Record<string, unknown> = any>
  extends Parameter implements Builder.ITable {

  proxy: { [K in keyof T]: Field<T[K]> };
  output: Record<string, unknown>[] = [];

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

      Object.defineProperty(proxy, key, {
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
        const emit: Record<string, unknown> = {};

        for(const { column, field } of this.used){
          if(!field)
            throw new Error(`Field for input ${column} is not defined.`);

          try {
            emit[column] = this.parent.digest(entry[column], field);
          }
          catch(err: unknown){
            throw new Error(`A provided value at \`${column}\` at index [${index}] is not acceptable.\n${(err as Error).message}`);
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

  toString(){
    return this.name;
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
  constructor(public from: string, parent: Builder){
    super();
    parent.templates.add(this);
  }

  toString(){
    return "`" + this.from + "`";
  }
}

export {
  render,
  Value,
  Parameter,
  DataField,
  DataTable,
  Cond,
  Group,
  QueryTemplate,
  Expression
}
