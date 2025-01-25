import { expect } from 'vitest'

expect.addSnapshotSerializer({
  test: (x) => x instanceof Error,
  serialize: (x: Error) => x.message
})

expect.addSnapshotSerializer({
  test: () => true,
  serialize: (query) => {
    return query.toString()
  }
})