import { Type } from '..';
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
    this.using = new Set(values(using).map(x => {
      if(x.hasOwnProperty('connection'))
        throw new Error(`Type ${x.name} already has assigned connection.`);

      x.connection = this;
      return x;
    }))
  }

  abstract get schema(): string;

  abstract close(): Promise<void>;
  abstract send(qs: string): Promise<any>;
  abstract sync(fix?: boolean): Promise<void>;
  abstract valid(type: Type.EntityType): Promise<boolean>;

  /**
   * @deprecated eventually superseded by `Query` class.
   */
  insert(table: string, data: Record<string, any>[]){
    const query = 
      `INSERT INTO ${table} (${Object.keys(data[0]).join(", ")}) ` +
      `VALUES ${data.map(row => `(${Object.values(row).join(", ")})`).join(", ")}`;

    return {
      then: (resolve: (res: any) => any, reject: (err: any) => any) => {
        return this.send(query).then(resolve).catch(reject);
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