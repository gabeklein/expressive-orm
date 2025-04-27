import { format } from 'sql-formatter';

import { Builder, Table } from '..';
import { values } from '../utils';
import { Generator } from './Generator';

declare namespace Connection {
  type Types =
    | typeof Table[]
    | { [key: string | number]: typeof Table }

  type Using = { [key: string | number]: typeof Table };

  type Ready<T extends Connection = Connection> = Omit<T, "then">;

  let None: Connection;
}

abstract class Connection {
  readonly using: Readonly<Set<typeof Table>>;
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
    onfulfilled?: (value: Connection.Ready<this>) => any,
    onrejected?: (reason: any) => any) {

    return (this.ready ? Promise.resolve() : this.sync())
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
  
  abstract sync(fix?: boolean): Promise<this>;

  abstract prepare<T = any>(builder: Builder): {
    all: (args?: any[]) => Promise<T[]>;
    get: (args?: any[]) => Promise<T | undefined>;
    run: (args?: any[]) => Promise<number>;
  }
}

class NoConnection extends Connection {
  constructor(){
    super([]);
  }

  get schema(): never {
    throw new Error("No connection to generate schema.");
  }

  prepare(builder: Builder){
    const template = String(new Generator(builder));

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
    return this;
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