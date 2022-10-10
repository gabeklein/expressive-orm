import Field from '../Field';
import { qualify } from '../utility';
import { generateTables, generateWhere } from './generate';
import Query from './Query';

declare namespace Select {
  type Function<R> = (where: Query.Where) => R | (() => R);
  type State = "fetch" | "select";
}

class Select<R> extends Query {
  selects = new Map<Field, number | string>();
  limit?: number;
  
  private map: () => R;
  private state?: Select.State;
  private focus!: { [alias: string]: any };

  constructor(from: Select.Function<R>){
    super();

    this.map = this.build(from);
    this.commit();
  }

  private build(from: Select.Function<R>){
    const select = from(this.interface);

    if(typeof select == "function"){
      this.state = "select";
      (select as () => R)();

      return select as () => R;
    }
    else if(select instanceof Field){
      const column = this.selects.size + 1;
      this.selects.set(select, column);

      return () => this.focus[column] as R;
    }
    else if(typeof select == "object" && select) {
      const desc = Object.getOwnPropertyDescriptors(select);
      
      for(const key in desc){
        const { value } = desc[key];
    
        if(value instanceof Field)
          this.selects.set(value, key);
      }
  
      return () => {
        const output = Object.create(select as {});
        const raw = this.focus;
    
        this.selects.forEach(column => {
          output[column] = raw[column];
        })
        
        return output as R;
      }
    }

    this.state = undefined;
    throw new Error("Bad argument");
  }

  access(field: Field){
    let column!: number;

    return (): any => {
      if(this.state == "select"){
        column = this.select(field);
        return field.placeholder;
      }

      if(this.state == "fetch"){
        const value = this.focus[column];
        return value === null ? undefined : value;
      }

      return field;
    }
  }

  select(field: Field){
    const column = this.selects.size + 1;
    this.selects.set(field, column);
    return column;
  }

  hydrate(raw: any[]){
    this.state = "fetch";
    const results = [] as R[];
    
    if(this.map)
      for(const row of raw){
        this.focus = row;
        results.push(this.map());
      }

    return results;
  }

  toString(): string {
    let select = "";

    if(this.selects.size){
      const selection = [] as string[];
    
      this.selects.forEach((alias, field) => {
        let select = field.qualifiedName;
    
        if(alias)
          select += " AS " + qualify(alias);
    
        selection.push(select);
      })

      select += "SELECT" + selection.join(",");
    }

    select += " " + generateTables(this);
    select += " " + generateWhere(this);

    return select;
  }

  async exec(){
    const sql = this.toString();

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.connection.query(sql);
  }

  async get(limit?: number): Promise<R[]> {
    if(typeof limit == "number")
      if(this.limit! < limit)
        throw new Error(`Limit of ${this.limit} is already specified by query.`);
      else
        this.limit = limit;

    const response = await this.exec();

    return this.hydrate(response); 
  }
  
  async getOne(orFail: false): Promise<R | undefined>;
  async getOne(orFail?: boolean): Promise<R>;
  async getOne(orFail?: boolean){
    const results = await this.get(1);

    if(results.length < 1 && orFail)
      throw new Error("No result found.");

    return results[0];
  }
  
  async find(orFail: true): Promise<R>;
  async find(orFail?: boolean): Promise<R | undefined>;
  async find(orFail?: boolean){
    return this.getOne(orFail || false);
  }

  static get<R>(from: Select.Function<R>){
    return new this(from).get();
  }

  static getOne<R>(from: Select.Function<R>){
    return new this(from).getOne(false);
  }

  static find<R>(from: Select.Function<R>){
    return new this(from).getOne(true);
  }
}

export default Select;