import Entity from '../Entity';
import Table from '../instruction/Table';
import String from '../instruction/String';

export class ColumnInfo extends Entity {
  table = Table("information_schema.columns");

  type = String("COLUMN_TYPE", {/* type: "mediumtext" */});
  name = String("COLUMN_NAME", { nullable: true });
  schema = String("TABLE_SCHEMA");
  tableName = String("TABLE_NAME");
  catalog = String("TABLE_CATALOG");
  isNullable = String("IS_NULLABLE");
  extra = String("EXTRA");
  privileges = String("PRIVILEGES", { nullable: true });

  // CHARACTER_MAXIMUM_LENGTH: null
  // CHARACTER_OCTET_LENGTH: null
  // CHARACTER_SET_NAME = String({ nullable: true });
  // COLLATION_NAME = String({ nullable: true });
  // COLUMN_COMMENT: ''
  // COLUMN_DEFAULT: null
  // COLUMN_KEY: 'PRI'
  // DATA_TYPE = Int();
  // DATETIME_PRECISION = Int({ nullable: true });
  // GENERATION_EXPRESSION: ''
  // NUMERIC_PRECISION: 10
  // NUMERIC_SCALE: 0
  // ORDINAL_POSITION: 1
  // SRS_ID: null
  // TABLE_CATALOG: 'def'
}