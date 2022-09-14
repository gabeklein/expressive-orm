import Entity, { Int, Table, VarChar } from '../..';

class KeyColumnUsage extends Entity {
  table = Table({
    name: "KEY_COLUMN_USAGE",
    schema: "information_schema"
  })
  constraintCatalog = VarChar({
    column: "CONSTRAINT_CATALOG",
    length: 64
  })
  constraintSchema = VarChar({
    column: "CONSTRAINT_SCHEMA",
    length: 64
  })
  constraintName = VarChar({
    column: "CONSTRAINT_NAME",
    length: 64
  })
  tableCatalog = VarChar({
    column: "TABLE_CATALOG",
    length: 64
  })
  tableSchema = VarChar({
    column: "TABLE_SCHEMA",
    length: 64
  })
  tableName = VarChar({
    column: "TABLE_NAME",
    length: 64
  })
  columnName = VarChar({
    column: "COLUMN_NAME",
    length: 64
  })
  ordinalPosition = Int({
    column: "ORDINAL_POSITION"
  })
  positionInUniqueConstraint = Int({
    column: "POSITION_IN_UNIQUE_CONSTRAINT"
  })
  referencedTableSchema = VarChar({
    column: "REFERENCED_TABLE_SCHEMA",
    length: 64
  })
  referencedTableName = VarChar({
    column: "REFERENCED_TABLE_NAME",
    length: 64
  })
  referencedColumnName = VarChar({
    column: "REFERENCED_COLUMN_NAME",
    length: 64
  })
}

export default KeyColumnUsage;