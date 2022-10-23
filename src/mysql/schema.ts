import Entity from '../Entity';
import { Boolean, Int, Primary, Table, String } from '..';

export class Column extends Entity {
  this = Table({
    name: "COLUMNS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = String({
    column: "TABLE_CATALOG",
    datatype: "varchar"
  });

  characterSet = String({ 
    column: "CHARACTER_SET_NAME",
    datatype: "varchar",
    nullable: true
  });

  collation = String({ 
    column: "COLLATION_NAME",
    datatype: "varchar",
    nullable: true
  });

  comment = String({
    column: "COLUMN_COMMENT",
    datatype: "text"
  });

  dataType = String({
		column: "DATA_TYPE",
    datatype: "longtext"
  });

  datePrecision = Int({
    column: "DATETIME_PRECISION",
    nullable: true
  });

  default = String({
    column: "COLUMN_DEFAULT",
    datatype: "text",
    nullable: true
  });

  extra = String({
    column: "EXTRA",
    datatype: "varchar",
    nullable: true
  });

  generator = String({
		column: "COLUMN_TYPE",
    datatype: "longtext"
  });

  isNullable = Boolean({
    column: "IS_NULLABLE",
    either: ["YES", "NO"]
  });

  name = String({ 
    column: "COLUMN_NAME",
    datatype: "varchar",
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
    datatype: "varchar",
    nullable: true
  });

  schema = String({
    column: "TABLE_SCHEMA",
    datatype: "varchar",
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

  tableName = String({
    column: "TABLE_NAME",
    datatype: "varchar"
  });

  type = String({
		column: "COLUMN_TYPE",
    datatype: "mediumtext"
  });

  // actually an ENUM
  key = String({
    column: "COLUMN_KEY",
    datatype: "varchar",
    length: 3,
    nullable: true,
    oneOf: [
      "PRI",
      "UNI",
      "MUL"
    ]
  });
}

export class Constraint extends Entity {
  this = Table({
    name: "TABLE_CONSTRAINTS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = String({
    column: 'CONSTRAINT_CATALOG',
    datatype: "varchar",
    length: 64
  })

  enforced = String({
    column: 'ENFORCED',
    datatype: "varchar",
    length: 3
  })

  name = String({
    column: 'CONSTRAINT_NAME',
    datatype: "varchar",
    nullable: true,
    length: 64
  })

  schema = String({
    column: 'CONSTRAINT_SCHEMA',
    datatype: "varchar",
    length: 64
  })

  tableName = String({
    column: 'TABLE_NAME',
    datatype: "varchar",
    length: 64
  })

  tableSchema = String({
    column: 'TABLE_SCHEMA',
    datatype: "varchar",
    length: 64
  })

  type = String({
    column: 'CONSTRAINT_TYPE',
    datatype: "varchar",
    length: 11
  })
}

export class KeyColumnUsage extends Entity {
  this = Table({
    name: "KEY_COLUMN_USAGE",
    schema: "information_schema"
  })

  constraintCatalog = String({
    column: "CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  constraintSchema = String({
    column: "CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  constraintName = String({
    column: "CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  tableCatalog = String({
    column: "TABLE_CATALOG",
    datatype: "varchar",
    length: 64
  })

  tableSchema = String({
    column: "TABLE_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  tableName = String({
    column: "TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  columnName = String({
    column: "COLUMN_NAME",
    datatype: "varchar",
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
    datatype: "varchar",
    length: 64
  })

  referencedTableName = String({
    column: "REFERENCED_TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  referencedColumnName = String({
    column: "REFERENCED_COLUMN_NAME",
    datatype: "varchar",
    length: 64
  })
}

export class ReferentialConstraints extends Entity {
  this = Table({
    name: "REFERENTIAL_CONSTRAINTS",
    schema: "information_schema"
  })

  constraintCatalog = String({
    column: "CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  constraintName = String({
    column: "CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  constraintSchema = String({
    column: "CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  referencedTableName = String({
    column: "REFERENCED_TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  tableName = String({
    column: "TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintCatalog = String({
    column: "UNIQUE_CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintName = String({
    column: "UNIQUE_CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintSchema = String({
    column: "UNIQUE_CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  deleteRule = String({
    column: "DELETE_RULE",
    datatype: "varchar"
  })

  matchOption = String({
    column: "MATCH_OPTION",
    datatype: "varchar"
  })

  updateRule = String({
    column: "UPDATE_RULE",
    datatype: "varchar"
  })
}