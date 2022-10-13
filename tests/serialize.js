const { format } = require('sql-formatter');

module.exports = {
  test: () => true,
  serialize: x => format(String(x))
}