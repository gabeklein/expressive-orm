import Entity from '../Entity';
import { qualify } from '../utility';
import { serialize } from './generate';
import Query from './Query';

declare namespace Insert {
  type Expect<T extends Entity> = { [K in Entity.Field<T>]?: T[K] };
  type Function<T extends Entity> = (where: Query.Where, entity: T) => Expect<T>;
  type Values<T extends Entity> = Expect<T> | Expect<T>[];
}

class Insert<T extends Entity> extends Query {
  keys = new Set<string>();
  entries?: { [column: string]: string }[];

  constructor(
    public into: Entity.Type<T>,
    data: Insert.Values<T>){

    into.ensure();

    super();
    this.insert(
      Array.isArray(data) ? data : [data]
    );
  }

  insert(data: Insert.Expect<T>[]){
    const { fields } = this.into;

    this.entries = data.map(insert => {
      const values = {} as { [key: string]: any };
  
      fields.forEach((field, key) => {
        const { column } = field;
  
        if(key in insert){
          const given = insert[key as Entity.Field<T>];
          const value = field.set ? field.set(given) : given;
  
          this.keys.add(column); 
          values[column] = value;
        }
      })
      
      return values;
    });
  }

  toString(){
    if(this.entries)
      return generate(this.into.name, this.keys, this.entries);
    else
      return "???";
  }
}

export default Insert;

function generate(
  table: string,
  include: Set<string>,
  entries: { [key: string]: any }[]
){
  const keys = Array.from(include);
  const tableName = qualify(table);

  const insertKeys = keys
    .map(k => qualify(k))
    .join(",");

  const insertValues = entries.map(entry => {
    const values = keys
      .map(key => serialize(entry[key]))
      .join(",");

    return "(" + values + ")";
  }).join(",");

  return `INSERT INTO ${tableName} (${insertKeys}) VALUES ${insertValues}`;
}