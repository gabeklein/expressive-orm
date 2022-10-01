import Query from "./Query";

declare namespace Delete {
  type Function = (where: Query.Where) =>
    Query.Maybe<any> | Query.Maybe<any>[] | void;
}

class Delete extends Query {
  remove: Query.Table[];

  constructor(from: Delete.Function){
    super();

    const select = from(this.interface);

    if(select)
      this.remove = Array.isArray(select)
        ? select.map(x => this.table(x))
        : [ this.table(select) ]
    else {
      const from = this.tables[0];

      if(!from)
        throw new Error("Query has no default table.");

      this.remove = [from];
    }

    this.commit();
  }

  toString(){
    const rows = this.remove
      .map(x => x.alias || x.name)
      .join(",");

    let sql = `DELETE ${rows}`;

    if(this.tables.length > 1 || this.remove[0].alias)
      sql += " " + this.generateTables();

    sql += " " + this.generateWhere();

    return sql;
  }
}

export default Delete;