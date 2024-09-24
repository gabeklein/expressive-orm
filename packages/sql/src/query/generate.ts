import knex, { Knex } from 'knex';
import { Query } from './Query';

type Engine = 'pg' | 'mysql' | 'sqlite3' | 'mssql' | 'oracledb';

export function generate(
  using: Query<any>,
  engine: Engine | Knex = 'mysql'){

  const {
    deletes,
    order,
    selects,
    tables,
    updates,
    wheres
  } = using;

  if(typeof engine == "string")
    engine = knex({ client: engine, pool: { max: 0 } });

  let query: Knex.QueryBuilder;

  if (selects) {
    query = engine.select();
    selects.forEach((property, field) => {
      query.select(`${field} as ${property}`);
    });
  } 
  else if (updates) {
    query = engine(updates.table);
    const updateObj: { [key: string]: any } = {};
    updates.values.forEach((value, field) => {
      updateObj[field.column] = field.set ? field.set(value) : value;
    });
    query.update(updateObj);
  } 
  else if (deletes) {
    query = engine(deletes.name).del();
  } 
  else {
    // TDOO: Should this be replaced with star?
    query = engine.select("COUNT(*) as count");
  }

  const [from, ...joins] = tables;

  query.from(from.name);

  if (from.alias)
    query.as(from.alias);

  joins.forEach(table => {
    const { on, join } = table;
    let { name } = table;

    if (table.alias)
      name = `${name} as ${table.alias}`;

    if (join && on){
      const clause: Knex.JoinCallback = (table) => {
        for(const { left, right, operator } of on)
          table.on(String(left), operator, String(right));
      }

      switch (join.toLowerCase()) {
        case 'inner':
          query.innerJoin(name, clause);
          break;
        case 'left':
          query.leftJoin(name, clause);
          break;
        case 'right':
          query.rightJoin(name, clause);
          break;
        case 'full':
          query.fullOuterJoin(name, clause);
          break;
      }
    }
  });

  if (wheres.length)
    for (const { left, right, operator } of wheres){
      const value = typeof right == "number" ? right : String(right);
      query.where(String(left), operator, value);
    }

  if (order && order.length)
    for (const [field, dir] of order)
      query.orderBy(String(field), dir);

  return query
}