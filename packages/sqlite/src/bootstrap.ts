import { Entity, Field, Util } from '@expressive/sql';

export function bootstrap(entities: Iterable<Entity.EntityType>){
  const commands = [] as string[];
  
  for(const entity of entities)
    entity.ensure();

  for(const entity of entities)
    commands.push(table(entity));

  for(const entity of entities){
    const statement = constraint(entity);

    if(statement)
      commands.push(statement);
  }
  
  return commands.join(";");
}

export function drop(tables: Entity.EntityType[]){
  const commands = [];

  for(const table of tables)
    commands.push(`DROP TABLE IF EXISTS ${table.name}`);

  return commands;
}

export function table(table: Entity.EntityType){
  const { table: name } = table;
  const statements = [] as string[];

  table.fields.forEach(field => {
    const sql = column(field);

    if(sql)
      statements.push(sql);
  });

  return `CREATE TABLE IF NOT EXISTS ${name} (${statements.join(",")})`;
}

export function constraint(table: Entity.EntityType){
  const statement = [] as string[];

  table.fields.forEach(field => {
    const { constraint } = field;

    if(constraint)
      statement.push(constraint);
  })

  if(statement.length)
    return `ALTER TABLE ${table.name} ${statement.join(", ")}`;
}

export function column(from: Field){
  let { datatype } = from;
  let statement = Util.qualify(from.column);

  if(datatype === undefined)
    return;

  if(from.primary){
    if(!datatype.includes("INT"))
      throw new Error("Primary key may only be INTEGER.")

    datatype = "INTEGER";
    statement += " INTEGER PRIMARY KEY";

    if(from.increment !== false)
      from.increment = true;
  }
  else {
    statement += ` ${datatype}`;

    if(!from.nullable)
      statement += " NOT NULL";
  
    if(from.default !== undefined)
      statement += ` DEFAULT ${Util.escapeString(from.default)}`;
  }
  
  if(from.increment){
    if(datatype == "INTEGER")
      statement += " AUTOINCREMENT";
    else
      throw new Error("Can only auto-increment INTEGER values.")
  }

  return statement;
}