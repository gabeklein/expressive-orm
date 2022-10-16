import Entity from '../Entity';
import { Bool, Int, Primary, Table, Text, VarChar } from '..';

export class Column extends Entity {
  this = Table({
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

export class Constraint extends Entity {
  this = Table({
    name: "TABLE_CONSTRAINTS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = VarChar({
    column: 'CONSTRAINT_CATALOG',
    length: 64
  })

  enforced = VarChar({
    column: 'ENFORCED',
    length: 3
  })

  name = VarChar({
    column: 'CONSTRAINT_NAME',
    nullable: true,
    length: 64
  })

  schema = VarChar({
    column: 'CONSTRAINT_SCHEMA',
    length: 64
  })

  tableName = VarChar({
    column: 'TABLE_NAME',
    length: 64
  })

  tableSchema = VarChar({
    column: 'TABLE_SCHEMA',
    length: 64
  })

  type = VarChar({
    column: 'CONSTRAINT_TYPE',
    length: 11
  })
}

export class KeyColumnUsage extends Entity {
  this = Table({
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

export class ReferentialConstraints extends Entity {
  this = Table({
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