const { format } = require('sql-formatter');

module.exports = {
  test: () => true,
  serialize: (query) => format(String(query)).replace(/^/gm, "\t")
}