const { format } = require('sql-formatter');
const { Query } = require('../src');

module.exports = {
  test: (x) => x instanceof Query || typeof x == "string",
  serialize: (query) => format(String(query)).replace(/^/gm, "\t")
}