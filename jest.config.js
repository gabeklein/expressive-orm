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
  "unique",
  "update",
  "values",
  "where",
]

module.exports = {
  test: (x) => true,
  serialize: (query) => {
    const regex = new RegExp(`(?:[^\`]|^)(${SQL_KEYWORDS.join("|")})(?<![\`])`, "g");

    try {
      return format(String(query))
        .replace(regex, x => x.toUpperCase())
        .replace(/^/gm, "")
        .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
    }
    catch (e) {
      return query;
    }
  }
}