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
  
  private hydrate: (raw: any[]) => R[];

  constructor(from: Select.Function<R>){
    super();

    const select = from(this.interface);
    this.hydrate = this.build(select);
    this.commit();
  }

  private build(select: R | (() => R)): (raw: any[]) => R[] {
    const { selects } = this;

    if(select instanceof Field){
      selects.set(select, 1);

      return raw => raw.map(row => row[1]);
    }

    if(typeof select == "function"){
      let focus: any;

      this.access = field => {
        selects.set(field, selects.size + 1);
        return field.placeholder;
      };

      (select as () => R)();

      this.access = field => {
        const value = focus[selects.get(field)!];
        return value === null ? undefined : value;
      }

      return raw => {
        const results = [] as R[];

        for(const row of raw){
          focus = row;
          results.push((select as () => R)());
        }

        return results;
      }
    }

    if(select && typeof select == "object"){
      const desc = Object.getOwnPropertyDescriptors(select);
      
      for(const key in desc){
        const { value } = desc[key];
    
        if(value instanceof Field)
          selects.set(value, key);
      }
  
      return raw => raw.map(row => {
        const output = Object.create(select as {});
    
        selects.forEach(column => {
          output[column] = row[column];
        })
        
        return output as R;
      })
    }

    throw new Error("Bad argument");
  }

  toString(): string {
    const { selects } = this;
    let query = "";

    if(selects.size){
      const keys = [] as string[];
    
      selects.forEach((alias, field) => {
        let select = field.qualifiedName;
    
        if(alias)
          select += " AS " + qualify(alias);
    
        keys.push(select);
      })

      query += "SELECT" + keys.join(",");
    }

    query += " " + generateTables(this);
    query += " " + generateWhere(this);

    return query;
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