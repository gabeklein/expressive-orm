import mysql, { escapeId } from 'mysql';

import Field from '../instruction/Field';
import { OneToManyRelation } from '../instruction/One';
import Table from '../Table';
import { escapeString, qualify } from '../utility';
import Connection from './Connection';

declare namespace MySQL {
  interface Config extends mysql.ConnectionConfig {
    dry?: boolean;
    maxConnections?: number;
    sync?: boolean;
    nuke?: boolean;
  }
}

class MySQL extends Connection {
  options: MySQL.Config;
  connection?: mysql.Connection | mysql.Pool;

  constructor(opts: MySQL.Config = {}){
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

export default MySQL;

export function dropTablesMySQL(tables: Iterable<Table>){
  const commands = [];

  for(const table of tables)
    commands.push(`DROP TABLE IF EXISTS ${table.name}`);

  return commands;
}

export function createTableMySQL(tables: Iterable<Table>){
  const commands = [];

  for(const table of tables){
    const tableName = table.name;
    const statements = [] as string[];

    table.fields.forEach(field => {
      const sql = createColumnMySQL(field);

      if(sql)
        statements.push(sql);
    });

    commands.push(
      `CREATE TABLE IF NOT EXISTS ${tableName} (${statements.join(",")})`
    )
  }

  return commands;
}

export function addTableConstraints(tables: Iterable<Table>){
  const commands = [] as string[];

  for(const table of tables){
    const statement = [] as string[];

    table.fields.forEach(field => {
      if(field instanceof OneToManyRelation){
          const { type, column, constraintName } = field;
          const foreignName = type.table.name;
      
          statement.push([
            `ADD`,
            constraintName ? `CONSTRAINT ${escapeId(constraintName)}` : "",
            `FOREIGN KEY (${column})`,
            `REFERENCES ${foreignName}(id)`
          ].join(" "));
        }
    })

    if(statement.length){
      commands.push(
        `ALTER TABLE ${table.name} ${statement.join(", ")}`
      )
    }
  }

  return commands;
}

export function createColumnMySQL(from: Field){
  if(from.datatype === undefined)
    return;

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