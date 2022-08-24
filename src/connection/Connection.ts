import Entity from '../Entity';
import Definition from '../Definition';

namespace Connection {
  export type Entities =
    | typeof Entity[]
    | { [key: string]: typeof Entity }
}

abstract class Connection {
  managed = new Map<typeof Entity, Definition>();

  abstract query(queryString: string): Promise<any>;

  apply(from: Connection.Entities){
    const entities = Object.values<typeof Entity>(from);

    for(const type of entities){
      const table = type.init(this);
      this.managed.set(type, table);
    }

    return this;
  }

  close?(): void;
}

export default Connection;