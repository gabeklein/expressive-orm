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
    const database = name || this.database;

    if(!database)
      throw new Error("No database specified!");

    let schema = this.schema[database];

    if(!schema){
      schema = new Schema(database);

      const columns = await getColumns(database);
  
      this.schema[database] = schema;
      columns.forEach(schema.add, schema);
    }

    return schema;
  }
}

export default Connection;