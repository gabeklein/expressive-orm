const { format } = require('sql-formatter');

module.exports = {
  test: (x) => /Query/.test(x.constructor.name),
  serialize: (query) => format(String(query)).replace(/^/gm, "\t")
}