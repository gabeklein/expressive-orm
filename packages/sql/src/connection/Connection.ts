import { Type } from '../Type';
import { Schema } from './Schema';

namespace Connection {
  export type Entities =
    | typeof Type[]
    | { [key: string]: typeof Type }
}

abstract class Connection {
  database?: string;

  managed = new Set<typeof Type>();
  schema = {} as { [name: string]: Schema };

  abstract query(queryString: string): Promise<any>;

  abstract close(): void;

  apply(from: Connection.Entities){
    const entities = Object.values<typeof Type>(from);

    for(const type of entities){
      type.connection = this;
      this.managed.add(type.ensure());
    }

    return this;
  }
}

export { Connection }