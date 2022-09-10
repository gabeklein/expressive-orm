import Entity from "../../Entity"
import Table from "../../instruction/Table"

export class ReferentialConstraints extends Entity {
  table = Table({
    name: "REFERENTIAL_CONSTRAINTS",
    schema: "information_schema"
  })

  constraintCatalog = String({
    column: "CONSTRAINT_CATALOG",
    length: 64
  })

  constraintSchema = String({
    column: "CONSTRAINT_SCHEMA",
    length: 64
  })

  constraintName = String({
    column: "CONSTRAINT_NAME",
    length: 64
  })

  uniqueConstraintCatalog = String({
    column: "UNIQUE_CONSTRAINT_CATALOG",
    length: 64
  })

  uniqueConstraintSchema = String({
    column: "UNIQUE_CONSTRAINT_SCHEMA",
    length: 64
  })

  uniqueConstraintName = String({
    column: "UNIQUE_CONSTRAINT_NAME",
    length: 64
  })

  // TODO: Enum
  matchOption = String({
    column: "MATCH_OPTION"
  })

  // TODO: Enum
  updateRule = String({
    column: "UPDATE_RULE"
  })

  // TODO: Enum
  deleteRule = String({
    column: "DELETE_RULE"
  })

  tableName = String({
    column: "TABLE_NAME",
    length: 64
  })

  referencedTableName = String({
    column: "REFERENCED_TABLE_NAME",
    length: 64
  })
}

export default ReferentialConstraints;