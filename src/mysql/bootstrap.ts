import Entity from '..';
import Field from '../Field';
import { escapeString, qualify } from '../utility';

export function drop(table: Entity.Type){
  return `DROP TABLE IF EXISTS ${table.name}`
}

export function create(table: Entity.Type){
  const { table: name } = table;
  const statements = [] as string[];

  table.fields.forEach(field => {
    const sql = column(field);

    if(sql)
      statements.push(sql);
  });

  return `CREATE TABLE IF NOT EXISTS ${name} (${statements.join(",")})`
}

export function constraints(table: Entity.Type){
  const statement = [] as string[];

  table.fields.forEach(field => {
    const { constraint } = field;

    if(constraint)
      statement.push(constraint);
  })

  if(statement.length)
    return `ALTER TABLE ${table.name} ${statement.join(", ")}`
}

function column(from: Field){
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