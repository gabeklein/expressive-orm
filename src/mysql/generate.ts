import Field from '../Field';
import Table from '../Table';
import { escapeString, qualify } from '../utility';

export function dropTablesMySQL(tables: Table[]){
  const commands = [];

  for(const table of tables)
    commands.push(`DROP TABLE IF EXISTS ${table.name}`);

  return commands;
}

export function createTableMySQL(tables: Table[]){
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

export function addTableConstraints(tables: Table[]){
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