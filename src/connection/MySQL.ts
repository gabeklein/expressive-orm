import mysql from 'mysql';

import Field from '../instruction/Field';
import Table from '../Table';
import { escapeString, qualify } from '../utility';
import Connection from './Connection';

declare namespace MySQL {
  interface Config extends mysql.ConnectionConfig {
    maxConnections?: number;
    sync?: boolean;
    nuke?: boolean;
  }
}

class MySQL extends Connection {
  options: MySQL.Config;
  connection: mysql.Connection | mysql.Pool;

  constructor(opts: MySQL.Config = {}){
    super();

    const config: mysql.ConnectionConfig = {
      ...opts,
      multipleStatements: true
    }
    
    this.options = opts;
    this.connection = opts.maxConnections! > 1
      ? mysql.createPool(config)
      : mysql.createConnection(config);
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

  createTables(){
    const sql = createTableMySQL(this.managed.values());

    this.query(sql);
  }
}

export default MySQL;

export function createTableMySQL(
  tables: Iterable<Table>, nuke?: boolean){

  const commands = [];

  for(const table of tables){
    const tableName = table.name;

    if(nuke)
      commands.splice(commands.length / 2, 0,
        `DROP TABLE IF EXISTS ${tableName};`
      )

    const statements = [] as string[];

    table.fields.forEach(field => {
      const sql = createColumnMySQL(field);

      if(sql)
        statements.push(sql);
    });

    commands.push(
      `CREATE TABLE IF NOT EXISTS ${tableName} (${statements.join(",")});`
    )
  }

  return commands.join("\n ");
}

export function createColumnMySQL(from: Field){
  if(from.datatype === undefined)
    return undefined;

  const statement = [qualify(from.column), from.datatype];

  if(!from.nullable)
    statement.push("NOT NULL");

  if(from.default !== undefined)
    statement.push(`DEFAULT ${escapeString(from.default)}`);

  if(from.datatype == "INT" && from.increment)
    statement.push("AUTO_INCREMENT");

  if(from.primary)
    statement.push("PRIMARY KEY");

  return statement.join(" ");
}