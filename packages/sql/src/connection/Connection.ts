import { Type, Query } from '..';
import { values } from '../utils';

declare namespace Connection {
  type Types =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  type Using = { [key: string | number]: typeof Type };

  let None: Connection;
}

abstract class Connection {
  readonly using: Readonly<Set<typeof Type>>;
  readonly ready = false;

  constructor(using: Connection.Types){
    this.using = new Set(values(using).map(type => {
      if(type.hasOwnProperty('connection'))
        throw new Error(`Type ${type.name} already has assigned connection.`);

      type.connection = this;
      return type;
    }))
  }

  abstract get schema(): string;

  abstract close(): Promise<void>;
  abstract sync(fix?: boolean): Promise<void>;
  abstract valid(type: Type.EntityType): Promise<boolean>;

  abstract prepare<T>(builder: Query.Builder<T> | string): {
    all: (params?: any[]) => Promise<T[]>;
    get: (params?: any[]) => Promise<T>;
    run: (params?: any[]) => Promise<number>;
  }

  /**
   * @deprecated eventually superseded by `Query` class.
   */
  insert(table: string, data: Record<string, any>[]){
    const query = 
      `INSERT INTO ${table} (${Object.keys(data[0]).join(", ")}) ` +
      `VALUES ${data.map(row => `(${Object.values(row).join(", ")})`).join(", ")}`;

    return {
      then: (resolve: (res: any) => any, reject: (err: any) => any) => {
        return this.prepare(query).run().then(resolve).catch(reject);
      },
      toString: () => query
    }
  }
}

class NoConnection extends Connection {
  constructor(){
    super([]);
  }

  get schema(): never {
    throw new Error("No connection to generate schema.");
  }

  prepare(){
    const run = () => Promise.reject();
    return { all: run, get: run, run };
  }

  async close(){
    return;
  }

  async send(){
    throw new Error("Cannot send a query to a null connection.");
  }

  async sync(){
    return;
  }

  async valid(){
    return true;
  }
}

Connection.None = new NoConnection();

export { Connection };