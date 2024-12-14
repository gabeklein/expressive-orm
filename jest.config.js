const { format } = require('sql-formatter');

const SQL_KEYWORDS = [
  "add",
  "alter",
  "and",
  "asc",
  "as",
  "autoincrement",
  "column",
  "constraint",
  "create table",
  "desc",
  "delete",
  "delete from",
  "drop",
  "foreign key",
  "from",
  "group by",
  "having",
  "key", 
  "if not exists",
  "inner join",
  "insert",
  "into",
  "join",
  "left join",
  "limit",
  "not null",
  "null",
  "offset",
  "on",
  "order by",
  "primary",
  "references",
  "select",
  "set",
  "union all",
  "unique",
  "update",
  "values",
  "where",
]

const escapable = new RegExp(`(?:[^\`]|^)(${SQL_KEYWORDS.join("|")})(?<![\`])`, "g");

module.exports = {
  test: (x) => true,
  serialize: (query) => {
    try {
      
      return format(query.toString())
        .replace(escapable, x => x.toUpperCase())
        .replace(/^/gm, "")
        .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
    }
    catch(e) {
      if(typeof query === "string")
        return query;
      else
        throw e;
    }
  }
}