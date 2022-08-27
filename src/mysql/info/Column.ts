import Entity from '../../Entity';
import Table from '../../instruction/Table';
import String from '../../instruction/String';
import Int from '../../instruction/Int';
import Primary from '../../instruction/Primary';

class Column extends Entity {
  table = Table({
    name: "COLUMNS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = String({
    column: "TABLE_CATALOG"
  });

  characterSet = String({ 
		column: "CHARACTER_SET_NAME",
    nullable: true
  });

  collation = String({ 
		column: "COLLATION_NAME",
    nullable: true
  });

  comment = String({ 
		column: "COLUMN_COMMENT",
    type: "text"
  });

  dataType = String({ 
		column: "COLUMN_TYPE",
    type: "longtext"
  });

  datePrecision = Int({
    column: "DATETIME_PRECISION",
    nullable: true
  });

  default = String({ 
		column: "COLUMN_DEFAULT",
    type: "text",
    nullable: true
  });

  extra = String({
    column: "EXTRA",
    nullable: true
  });

  generator = String({ 
		column: "COLUMN_TYPE",
    type: "longtext"
  });

  isNullable = String({
    column: "IS_NULLABLE"
  });

  name = String({ 
		column: "COLUMN_NAME",
    nullable: true
  });

  numericPrecision = Int({
    column: "NUMERIC_PRECISION",
    nullable: true
    /* type: "bigint" */
  });

  numericScale = Int({
    column: "NUMERIC_SCALE",
    nullable: true
    /* type: "bigint" */
  });

  octetLength = Int({
    column: "CHARACTER_OCTET_LENGTH",
    nullable: true,
    /* type: "bigint" */
  });

  position = Int({
    column: "ORDINAL_POSITION"
  });

  privileges = String({ 
		column: "PRIVILEGES",
    nullable: true
  });

  schema = String({
    column: "TABLE_SCHEMA"
  });

  size = Int({
    column: "CHARACTER_MAXIMUM_LENGTH",
    nullable: true
    /* type: "bigint" */
  });

  srsId = Int({
    column: "SRS_ID",
    nullable: true
  });

  tableName = String({
    column: "TABLE_NAME"
  });

  type = String({ 
		column: "COLUMN_TYPE",
    type: "mediumtext"
  });

  // actually an ENUM
  key = String({
    column: "COLUMN_KEY",
    type: "varchar",
    length: 3,
    /*
      oneOf: [
        "PRI",
        "UNI",
        "MUL"
      ]
    */
  });
}

export default Column;