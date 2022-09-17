import mysql from 'mysql';

import Connection from '../connection/Connection';
import Column from './info/Column';
import { addTableConstraints, createTableMySQL, dropTablesMySQL } from './generate';
import Constraint from './info/Constraint';
import Entity from '../Entity';

const INFO_SCHEMA: Entity.Type[] = [
  Column,
  Constraint
];

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
  database?: string;

  constructor(
    opts: MySQLConnection.Config = {},
    entities?: Connection.Entities){

    super();

    const config: mysql.ConnectionConfig = {
      ...opts,
      multipleStatements: true
    }
    
    this.database = opts.database;
    this.options = opts;

    if(!opts.dry)
      this.connection = opts.maxConnections! > 1
        ? mysql.createPool(config)
        : mysql.createConnection(config);

    for(const Entity of INFO_SCHEMA)
      Entity.init(this);

    if(entities)
      this.apply(entities);
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