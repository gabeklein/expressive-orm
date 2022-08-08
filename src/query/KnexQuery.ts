import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Entity from '../Entity';
import Query from './Query';

const KNEX = knex({ client: "mysql" });

class KnexQuery<T extends Entity> extends Query<T> {
  tableName: string;

  constructor(type: typeof Entity){
    const Type = type as unknown as typeof Entity;

    super(type);

    this.tableName = Type.tableName;
  }

  async get(limit: number){
    const qb = this.commit();

    if(limit)
      qb.limit(limit);

    logSQL(qb);

    const results = [] as any[];

    return results.map(row => {
      const item = {} as any;

      this.selects.forEach(apply => {
        apply(row, item);
      });
      
      return item;
    });
  }

  commit(){
    const builder = KNEX.from(this.tableName);

    for(const clause of this.where)
      builder.whereRaw(clause.join(" "));

    for(const key of this.selects.keys())
      builder.select(key);

    return builder;
  }

  print(){
    const qb = this.commit();
    logSQL(qb);
  }
}

function logSQL(qb: Knex.QueryBuilder){
  return console.log(format(qb.toString()), "\n");
}

export default KnexQuery;