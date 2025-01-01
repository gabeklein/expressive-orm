import { Query, Type } from '..';
import { escape, values } from '../utils';

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

  abstract toRunner<T>(builder: Query.Builder<T>): () => Query<T> | Query.Selects<T>;

  abstract run(query: string, params?: any[]): Promise<void>;

  /**
   * @deprecated eventually superseded by `Query` class.
   */
  insert(table: string, data: Record<string, any>[]){
    const keys = Object.keys(data[0]);
    const values = data.map(row => `(${Object.values(row).map(escape)})`);
    const query = `INSERT INTO ${table} (${keys}) VALUES ${values}`;

    return {
      then: (resolve: (res: any) => any, reject: (err: any) => any) => {
        return this.run(query, []).then(resolve).catch(reject);
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

  toRunner(builder: Query.Builder){
    return (...args: any[]): Query<never> => ({
      params: builder.accept(args),
      toString: () => builder.toString(),
      then: (_, cb) => this.run().catch(cb)
    })
  }

  async close(){
    return;
  }

  async run(): Promise<never> {
    throw new Error("No connection to run query.");
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