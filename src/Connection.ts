import mysql from 'mysql';

import Entity from './Entity';
import Field from './instruction/Field';
import Table from './Table';
import { escape, escapeString } from './utility';

declare namespace Connection {
  interface Config extends mysql.ConnectionConfig {
    maxConnections?: number;
    sync?: boolean;
    nuke?: boolean;
  }
}

class Connection {
  options: Connection.Config;
  connection: mysql.Connection | mysql.Pool;
  managed = new Map<typeof Entity, Table>();

  apply(from: typeof Entity[]): void;
  apply(from: { [key: string | number]: typeof Entity }): void;
  apply(from: {}){
    const entities = Object.values<typeof Entity>(from);
    const commands = [];

    for(const type of entities){
      const table = type.init(this);
      const tableName = table.name;

      if(this.options.sync){
        if(this.options.nuke)
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
      
      this.managed.set(type, table);
    }

    const sql = commands.join("\n ");

    this.query(sql);
  }

  constructor(opts: Connection.Config = {}, callback?: () => void){
    opts.multipleStatements = true;
    this.options = opts;

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

export function createColumnMySQL(from: Field){
  if(from.datatype === undefined)
    return undefined;

  const statement = [escape(from.column), from.datatype];

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

export default Connection;