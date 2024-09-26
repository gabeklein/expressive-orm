const { format } = require('sql-formatter');

module.exports = {
  test: (x) => true,
  serialize: (query) => {
    try {
      return format(String(query)).replace(/^/gm, "\t");
    }
    catch (e) {
      return query;
    }
  }
}