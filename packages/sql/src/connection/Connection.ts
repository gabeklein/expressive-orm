import Entity from '../Entity';
import Schema from './Schema';

namespace Connection {
  export type Entities =
    | typeof Entity[]
    | { [key: string]: typeof Entity }
}

abstract class Connection {
  database?: string;

  managed = new Set<typeof Entity>();
  schema = {} as { [name: string]: Schema };

  abstract query(queryString: string): Promise<any>;

  abstract close(): void;

  apply(from: Connection.Entities){
    const entities = Object.values<typeof Entity>(from);

    for(const type of entities){
      type.connection = this;
      this.managed.add(type.ensure());
    }

    return this;
  }
}

export default Connection;