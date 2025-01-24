import { format } from 'sql-formatter'
import { expect } from 'vitest'

expect.addSnapshotSerializer({
  test: (x) => true,
  serialize: (query) => {
    try {
      if(query instanceof Error)
        return query.message;
      
      const sql = format(query.toString(), { keywordCase: "upper" })
      return sql
        .replace(/ - > > /g, " ->> ")
        .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1")
    }
    catch(e) {
      if(typeof query === "string")
        return query
      else
        throw e
    }
  }
})