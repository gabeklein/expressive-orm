import mysql from 'mysql';
import Entity from './Entity';

declare namespace Connection {
  interface Config extends mysql.ConnectionConfig {
    maxConnections?: number;
  }
}

class Connection {
  connection: mysql.Connection | mysql.Pool;
  managed = new Set<Entity>();

  apply(from: typeof Entity[]): void;
  apply(from: { [key: string | number]: typeof Entity }): void;
  apply(from: {}){
    const entities = Object.values<typeof Entity>(from);
    
    for(const type of entities)
      type.init(this);

    return;
  }

  constructor(opts: Connection.Config = {}, callback?: () => void){
    this.connection = (opts as any).maxConnections > 1
      ? mysql.createPool(opts)
      : mysql.createConnection(opts);

    if(callback)
      this.connection.on("connection", callback);
  }

  query<T extends {} = any>(qs: string){
    return new Promise<T>((resolve, reject) => {
      this.connection.query(qs, (err, result) => {
        if(err)
          reject(err);
        else
          resolve(result);
      })
    })
  }

  close(){
    this.connection.end();
  }
}

export default Connection;