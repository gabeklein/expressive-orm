import mysql from 'mysql';

import Connection from '../connection/Connection';
import { ColumnInfo } from './entities';
import { addTableConstraints, createTableMySQL, dropTablesMySQL } from './generate';

declare namespace MySQLConnection {
  interface Config extends mysql.ConnectionConfig {
    dry?: boolean;
    maxConnections?: number;
    sync?: boolean;
    nuke?: boolean;
  }
}

class MySQLConnection extends Connection {
  options: MySQLConnection.Config;
  connection?: mysql.Connection | mysql.Pool;

  constructor(opts: MySQLConnection.Config = {}){
    super();

    const config: mysql.ConnectionConfig = {
      ...opts,
      multipleStatements: true
    }
    
    this.options = opts;

    if(!opts.dry)
      this.connection = opts.maxConnections! > 1
        ? mysql.createPool(config)
        : mysql.createConnection(config);

    ColumnInfo.init(this);
  }

  query<T extends {} = any>(qs: string){
    return new Promise<T>((resolve, reject) => {
      if(!this.connection)
        reject(new Error("Connection is in dry-mode."));
      else
        this.connection.query(qs, (err, result) => {
          if(err)
            reject(err);
          else
            resolve(result);
        })
    })
  }

  close(){
    if(this.connection)
      this.connection.end();
  }

  createTables(){
    const tables = Array.from(this.managed.values());
    const commands = [] as string[];

    if(this.options.nuke)
      commands.push(...dropTablesMySQL(tables));

    commands.push(...createTableMySQL(tables));
    commands.push(...addTableConstraints(tables))
    
    const sql = commands.join(";\n");

    if(!this.options.dry)
      this.query(sql);
    
    return sql;
  }
}

export default MySQLConnection;