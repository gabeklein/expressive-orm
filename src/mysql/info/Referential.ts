import Entity from '../../Entity';
import String from '../../instruction/String';
import Table from '../../instruction/Table';

class ReferentialConstraints extends Entity {
  table = Table({
    name: "REFERENTIAL_CONSTRAINTS",
    schema: "information_schema"
  })
  constraintCatalog = String({
    column: "CONSTRAINT_CATALOG",
    length: 64
  })
  constraintName = String({
    column: "CONSTRAINT_NAME",
    length: 64
  })
  constraintSchema = String({
    column: "CONSTRAINT_SCHEMA",
    length: 64
  })
  referencedTableName = String({
    column: "REFERENCED_TABLE_NAME",
    length: 64
  })
  tableName = String({
    column: "TABLE_NAME",
    length: 64
  })
  uniqueConstraintCatalog = String({
    column: "UNIQUE_CONSTRAINT_CATALOG",
    length: 64
  })
  uniqueConstraintName = String({
    column: "UNIQUE_CONSTRAINT_NAME",
    length: 64
  })
  uniqueConstraintSchema = String({
    column: "UNIQUE_CONSTRAINT_SCHEMA",
    length: 64
  })
  deleteRule = String({
    column: "DELETE_RULE"
  })
  matchOption = String({
    column: "MATCH_OPTION"
  })
  updateRule = String({
    column: "UPDATE_RULE"
  })
}

export default ReferentialConstraints;