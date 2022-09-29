import Field from "../Field";
import Query from "./Query";

declare namespace Select {
  type Function<R> = (where: Query.Where) => R | (() => R);
  type State = "fetch" | "select";
}

class Select<R> extends Query {
  selects = new Map<Field, number | string>();
  rawFocus!: { [alias: string]: any };
  limit?: number;
  map?: () => R;
  state?: Select.State;

  constructor(from: Select.Function<R>){
    super();
    
    const select = from(this.interface);

    this.commit();

    switch(typeof select){
      case "function":
        this.state = "select";
        this.map = select as () => R;
        (select as () => R)();
      break;

      case "object": {
        if(select instanceof Field){
          const column = this.selects.size + 1;
          this.selects.set(select, column);
      
          this.map = () => this.rawFocus[column];
        }

        const desc = Object.getOwnPropertyDescriptors(select);
      
        for(const key in desc){
          const { value } = desc[key];
      
          if(value instanceof Field)
            this.selects.set(value, key);
        }

        this.map = () => {
          const output = Object.create(select as {});
          const raw = this.rawFocus;
      
          this.selects.forEach(column => {
            output[column] = raw[column];
          })
          
          return output;
        }
      }
    }

    this.state = undefined;
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
        this.rawFocus = row;
        results.push(this.map());
      }

    return results;
  }

  async get(limit?: number): Promise<R[]> {
    if(typeof limit == "number")
      if(this.limit! < limit)
        throw new Error(`Limit of ${this.limit} is already defined in query.`);
      else
        this.limit = limit;

    const sql = String(this);

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.hydrate(
      await this.connection.query(sql)
    ); 
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