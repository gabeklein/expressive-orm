import Entity from '../Entity';
import getColumns from '../mysql/getColumns';
import Table from '../Table';
import Schema from './Schema';

namespace Connection {
  export type Entities =
    | typeof Entity[]
    | { [key: string]: typeof Entity }
}

abstract class Connection {
  database?: string;

  managed = new Map<typeof Entity, Table>();
  schema = {} as { [name: string]: Schema };

  abstract query(queryString: string): Promise<any>;

  close?(): void;

  apply(from: Connection.Entities){
    const entities = Object.values<typeof Entity>(from);

    for(const type of entities){
      const table = type.init(this);
      this.managed.set(type, table);
    }

    return this;
  }

  async getSchema(name?: string){
    if(!name)
      name = this.database;

    if(!name)
      throw new Error("No database specified, and no default one exists!");

    let schema = this.schema[name];

    if(!schema){
      const columns = await getColumns(name);

      schema = new Schema(this, name, columns);
    }

    return this.schema[name] = schema;
  }
}

export default Connection;