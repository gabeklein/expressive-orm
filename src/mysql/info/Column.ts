import Entity from '../../Entity';
import Bool from '../../instruction/Bool';
import Int from '../../instruction/Int';
import Primary from '../../instruction/Primary';
import Table from '../../instruction/Table';
import Text from '../../instruction/Text';
import VarChar from '../../instruction/VarChar';

class Column extends Entity {
  table = Table({
    name: "COLUMNS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = VarChar({
    column: "TABLE_CATALOG"
  });

  characterSet = VarChar({ 
		column: "CHARACTER_SET_NAME",
    nullable: true
  });

  collation = VarChar({ 
		column: "COLLATION_NAME",
    nullable: true
  });

  comment = Text({ 
		column: "COLUMN_COMMENT"
  });

  dataType = Text({ 
		column: "DATA_TYPE",
    size: "long"
  });

  datePrecision = Int({
    column: "DATETIME_PRECISION",
    nullable: true
  });

  default = Text({ 
		column: "COLUMN_DEFAULT",
    nullable: true
  });

  extra = VarChar({
    column: "EXTRA",
    nullable: true
  });

  generator = Text({ 
		column: "COLUMN_TYPE",
    size: "long"
  });

  isNullable = Bool({
    column: "IS_NULLABLE",
    either: ["YES", "NO"]
  });

  name = VarChar({ 
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

  privileges = VarChar({ 
		column: "PRIVILEGES",
    nullable: true
  });

  schema = VarChar({
    column: "TABLE_SCHEMA"
  });

  maxLength = Int({
    column: "CHARACTER_MAXIMUM_LENGTH",
    nullable: true
    /* type: "bigint" */
  });

  srsId = Int({
    column: "SRS_ID",
    nullable: true
  });

  tableName = VarChar({
    column: "TABLE_NAME"
  });

  type = Text({ 
		column: "COLUMN_TYPE",
    size: "medium"
  });

  // actually an ENUM
  key = VarChar({
    column: "COLUMN_KEY",
    length: 3,
    nullable: true,
    oneOf: [
      "PRI",
      "UNI",
      "MUL"
    ]
  });
}

export default Column;