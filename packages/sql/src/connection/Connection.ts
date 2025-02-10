import { format } from 'sql-formatter';

import { Type } from '..';
import { Generator } from '../connection/Generator';
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
  readonly ready: boolean = false;

  constructor(using: Connection.Types){
    this.using = new Set(values(using).map(type => {
      if(type.hasOwnProperty('connection'))
        throw new Error(`Type ${type.name} already has assigned connection.`);

      type.connection = this;
      return type;
    }))
  }

  async then(
    onfulfilled?: (value: Omit<this, "then">) => any,
    onrejected?: (reason: any) => any) {

    return (this.ready ? Promise.resolve() : this.sync(true))
      .then(() => {
        Object.defineProperty(this, 'then', { value: undefined });

        if (onfulfilled)
          onfulfilled(this);
      })
      .catch(onrejected);
  }

  abstract get schema(): string;

  async close(){
    for(const type of this.using)
      delete type.connection;
  }
  
  abstract sync(fix?: boolean): Promise<void>;
  abstract valid(type: Type.EntityType): Promise<boolean>;

  abstract prepare<T = any>(query: string): {
    all: (args?: any[]) => Promise<T[]>;
    get: (args?: any[]) => Promise<T | undefined>;
    run: (args?: any[]) => Promise<number>;
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
      toString: () => pretty(query)
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

  prepare(template: string){
    async function run(): Promise<never> {
      throw new Error("No connection to run query.");
    }

    return {
      all: run,
      get: run,
      run,
      toString(){
        return pretty(template);
      }
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

function pretty(sql: string){
  return format(sql, { keywordCase: "upper" })
    // TODO: this shouldn't apply - drop CTE from this module
    .replace(/ - > > /g, " ->> ")
    .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
}

Connection.None = new NoConnection();

export { Connection };