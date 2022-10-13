const { format } = require('sql-formatter');

module.exports = {
  test: () => true,
  serialize: query => {
    return format(String(query)).replace(/^/gm, "\t")
  }
}