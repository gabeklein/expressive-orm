const { format } = require('sql-formatter');

module.exports = {
  test: (x) => true,
  serialize: (query) => format(String(query)).replace(/^/gm, "\t")
}