import * as t from '@expressive/estree';

export const tableField = (
  name: string, schema?: string | false) => (

  t.classProperty("table",
    t.call("Table", schema
      ? t.object({ schema, name })
      : t.literal(name)
    )
  )
)

export const imports = (named: string[]) => (
  t.importDeclaration("../", [
    t.importSpecifier("Entity", "default"),
    ...named.map(x => t.importSpecifier(x))
  ])
)