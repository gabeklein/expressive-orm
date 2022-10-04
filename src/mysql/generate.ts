import Field from '../Field';
import Table from '../Table';
import { escapeString, qualify } from '../utility';

export function drop(tables: Table[]){
  const commands = [];

  for(const table of tables)
    commands.push(`DROP TABLE IF EXISTS ${table.name}`);

  return commands;
}

export function create(tables: Table[]){
  const commands = [];

  for(const table of tables){
    const tableName = table.name;
    const statements = [] as string[];

    table.fields.forEach(field => {
      const sql = createColumn(field);

      if(sql)
        statements.push(sql);
    });

    commands.push(
      `CREATE TABLE IF NOT EXISTS ${tableName} (${statements.join(",")})`
    )
  }

  return commands;
}

export function constraints(tables: Table[]){
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

function createColumn(from: Field){
  if(from.datatype === undefined)
    return;

  let statement = `${qualify(from.column)} ${from.datatype}`;

  if(!from.nullable)
    statement += " NOT NULL";

  if(from.default !== undefined)
    statement += ` DEFAULT ${escapeString(from.default)}`;

  if(from.datatype == "INT" && from.increment)
    statement += " AUTO_INCREMENT";

  if(from.primary)
    statement += " PRIMARY KEY";

  return statement;
}