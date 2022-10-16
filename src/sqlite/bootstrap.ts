import Entity, { Connection } from '..';
import Field from '../Field';
import { escapeString, qualify } from '../utility';

function bootstrap(connection: Connection, dryRun: true): string; 
function bootstrap(connection: Connection, dryRun?: false): Promise<void>;
function bootstrap(connection: Connection, dryRun?: boolean): string | Promise<void>;
function bootstrap(connection: Connection, dryRun?: boolean){
  const tables = Array.from(connection.managed.values());
  const commands = [] as string[];

  if(false)
    commands.push(...drop(tables));

  commands.push(...create(tables));
  commands.push(...constraints(tables))
  
  const sql = commands.join(";");

  return dryRun ? sql : connection.query(sql);
}

export default bootstrap;

function drop(tables: Entity.Type[]){
  const commands = [];

  for(const table of tables)
    commands.push(`DROP TABLE IF EXISTS ${table.name}`);

  return commands;
}

function create(tables: Entity.Type[]){
  const commands = [];

  for(const table of tables){
    const { table: name } = table;
    const statements = [] as string[];

    table.fields.forEach(field => {
      const sql = column(field);

      if(sql)
        statements.push(sql);
    });

    commands.push(
      `CREATE TABLE IF NOT EXISTS ${name} (${statements.join(",")})`
    )
  }

  return commands;
}

function constraints(tables: Entity.Type[]){
  const commands = [] as string[];

  for(const table of tables){
    const statement = [] as string[];

    table.fields.forEach(field => {
      const { constraint } = field;

      if(constraint)
        statement.push(constraint);
    })

    if(statement.length)
      commands.push(`ALTER TABLE ${table.name} ${statement.join(", ")}`);
  }

  return commands;
}

function column(from: Field){
  if(from.datatype === undefined)
    return;

  let statement = `${qualify(from.column)} ${from.datatype}`;

  if(!from.nullable)
    statement += " NOT NULL";

  if(from.default !== undefined)
    statement += ` DEFAULT ${escapeString(from.default)}`;

  if(from.primary)
    statement += " PRIMARY KEY";

  if(from.datatype == "INTEGER" && from.increment)
    statement += " AUTOINCREMENT";

  return statement;
}