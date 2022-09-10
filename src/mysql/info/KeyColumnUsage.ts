import Entity from '../../Entity';
import Int from '../../instruction/Int';
import String from '../../instruction/String';
import Table from '../../instruction/Table';

class KeyColumnUsage extends Entity {
  table = Table({
    name: "KEY_COLUMN_USAGE",
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
  tableCatalog = String({
    column: "TABLE_CATALOG",
    length: 64
  })
  tableSchema = String({
    column: "TABLE_SCHEMA",
    length: 64
  })
  tableName = String({
    column: "TABLE_NAME",
    length: 64
  })
  columnName = String({
    column: "COLUMN_NAME",
    length: 64
  })
  ordinalPosition = Int({
    column: "ORDINAL_POSITION"
  })
  positionInUniqueConstraint = Int({
    column: "POSITION_IN_UNIQUE_CONSTRAINT"
  })
  referencedTableSchema = String({
    column: "REFERENCED_TABLE_SCHEMA",
    length: 64
  })
  referencedTableName = String({
    column: "REFERENCED_TABLE_NAME",
    length: 64
  })
  referencedColumnName = String({
    column: "REFERENCED_COLUMN_NAME",
    length: 64
  })
}

export default KeyColumnUsage;