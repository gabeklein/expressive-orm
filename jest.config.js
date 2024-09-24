const { format } = require('sql-formatter');

module.exports = {
  test: (x) => x.constructor.name === 'Query',
  serialize: (query) => format(String(query)).replace(/^/gm, "\t")
}