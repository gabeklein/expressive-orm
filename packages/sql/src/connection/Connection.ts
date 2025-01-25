import { Type } from '..';
import { Builder } from '../query/Builder';
import { Generator } from '../query/Generator';
import { escape, values } from '../utils';

declare namespace Connection {
  type Types =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  type Using = { [key: string | number]: typeof Type };

  let None: Connection;
}

abstract class Connection {
  static generator = Generator;

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

  abstract prepare<T = any>(query: string): {
    all: (args?: any[]) => Promise<T[]>;
    get: (args?: any[]) => Promise<T | undefined>;
    run: (args?: any[]) => Promise<number>;
  }

  stringify(builder: Builder){
    const self = this.constructor as typeof Connection;
    return new self.generator(builder).toString();
  }

  /**
   * @deprecated eventually superseded by `Query` class.
   */
  insert(table: string, data: Record<string, any>[]){
    const keys = Object.keys(data[0]);
    const values = data.map(row => `(${Object.values(row).map(escape)})`);
    const query = `INSERT INTO ${table} (${keys}) VALUES ${values}`;

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
    async function run(): Promise<never> {
      throw new Error("No connection to run query.");
    }

    return {
      all: run,
      get: run,
      run
    }
  }

  async sync(){
    return;
  }

  async valid(){
    return true;
  }

  async close(){
    return;
  }
}

Connection.None = new NoConnection();

export { Connection };