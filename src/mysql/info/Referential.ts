import Entity, { VarChar, Table } from '../..';

class ReferentialConstraints extends Entity {
  table = Table({
    name: "REFERENTIAL_CONSTRAINTS",
    schema: "information_schema"
  })
  constraintCatalog = VarChar({
    column: "CONSTRAINT_CATALOG",
    length: 64
  })
  constraintName = VarChar({
    column: "CONSTRAINT_NAME",
    length: 64
  })
  constraintSchema = VarChar({
    column: "CONSTRAINT_SCHEMA",
    length: 64
  })
  referencedTableName = VarChar({
    column: "REFERENCED_TABLE_NAME",
    length: 64
  })
  tableName = VarChar({
    column: "TABLE_NAME",
    length: 64
  })
  uniqueConstraintCatalog = VarChar({
    column: "UNIQUE_CONSTRAINT_CATALOG",
    length: 64
  })
  uniqueConstraintName = VarChar({
    column: "UNIQUE_CONSTRAINT_NAME",
    length: 64
  })
  uniqueConstraintSchema = VarChar({
    column: "UNIQUE_CONSTRAINT_SCHEMA",
    length: 64
  })
  deleteRule = VarChar({
    column: "DELETE_RULE"
  })
  matchOption = VarChar({
    column: "MATCH_OPTION"
  })
  updateRule = VarChar({
    column: "UPDATE_RULE"
  })
}

export default ReferentialConstraints;