import { Bool, Type, Num, Primary, Str } from '@expressive/sql';

export class Column extends Type {
  id = Primary({
    tableName: "COLUMNS",
    tableSchema: "information_schema"
  });

  catalog = Str({
    column: "TABLE_CATALOG",
    datatype: "varchar"
  });

  characterSet = Str({ 
    column: "CHARACTER_SET_NAME",
    datatype: "varchar",
    nullable: true
  });

  collation = Str({ 
    column: "COLLATION_NAME",
    datatype: "varchar",
    nullable: true
  });

  comment = Str({
    column: "COLUMN_COMMENT",
    datatype: "text"
  });

  dataType = Str({
		column: "DATA_TYPE",
    datatype: "longtext"
  });

  datePrecision = Num({
    column: "DATETIME_PRECISION",
    datatype: "int",
    nullable: true
  });

  default = Str({
    column: "COLUMN_DEFAULT",
    datatype: "text",
    nullable: true
  });

  extra = Str({
    column: "EXTRA",
    datatype: "varchar",
    nullable: true
  });

  generator = Str({
		column: "COLUMN_TYPE",
    datatype: "longtext"
  });

  isNullable = Bool({
    column: "IS_NULLABLE",
    either: ["YES", "NO"]
  });

  name = Str({ 
    column: "COLUMN_NAME",
    datatype: "varchar",
    nullable: true
  });

  numericPrecision = Num({
    column: "NUMERIC_PRECISION",
    datatype: "bigint",
    nullable: true
  });

  numericScale = Num({
    column: "NUMERIC_SCALE",
    datatype: "bigint",
    nullable: true
  });

  octetLength = Num({
    column: "CHARACTER_OCTET_LENGTH",
    datatype: "bigint",
    nullable: true
  });

  position = Num({
    column: "ORDINAL_POSITION",
    datatype: "bigint"
  });

  privileges = Str({ 
    column: "PRIVILEGES",
    datatype: "varchar",
    nullable: true
  });

  schema = Str({
    column: "TABLE_SCHEMA",
    datatype: "varchar",
  });

  maxLength = Num({
    column: "CHARACTER_MAXIMUM_LENGTH",
    datatype: "bigint",
    nullable: true
  });

  srsId = Num({
    column: "SRS_ID",
    datatype: "int",
    nullable: true
  });

  tableName = Str({
    column: "TABLE_NAME",
    datatype: "varchar"
  });

  type = Str({
		column: "COLUMN_TYPE",
    datatype: "mediumtext"
  });

  // actually an ENUM
  key = Str({
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

export class Constraint extends Type {
  id = Primary({
    tableName: "TABLE_CONSTRAINTS",
    tableSchema: "information_schema"
  });

  catalog = Str({
    column: 'CONSTRAINT_CATALOG',
    datatype: "varchar",
    length: 64
  })

  enforced = Str({
    column: 'ENFORCED',
    datatype: "varchar",
    length: 3
  })

  name = Str({
    column: 'CONSTRAINT_NAME',
    datatype: "varchar",
    nullable: true,
    length: 64
  })

  schema = Str({
    column: 'CONSTRAINT_SCHEMA',
    datatype: "varchar",
    length: 64
  })

  tableName = Str({
    column: 'TABLE_NAME',
    datatype: "varchar",
    length: 64
  })

  tableSchema = Str({
    column: 'TABLE_SCHEMA',
    datatype: "varchar",
    length: 64
  })

  type = Str({
    column: 'CONSTRAINT_TYPE',
    datatype: "varchar",
    length: 11
  })
}

export class KeyColumnUsage extends Type {
  id = Primary({
    tableName: "KEY_COLUMN_USAGE",
    tableSchema: "information_schema"
  })

  constraintCatalog = Str({
    column: "CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  constraintSchema = Str({
    column: "CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  constraintName = Str({
    column: "CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  tableCatalog = Str({
    column: "TABLE_CATALOG",
    datatype: "varchar",
    length: 64
  })

  tableSchema = Str({
    column: "TABLE_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  tableName = Str({
    column: "TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  columnName = Str({
    column: "COLUMN_NAME",
    datatype: "varchar",
    length: 64
  })

  ordinalPosition = Num({
    column: "ORDINAL_POSITION",
    datatype: "int"
  })

  positionInUniqueConstraint = Num({
    column: "POSITION_IN_UNIQUE_CONSTRAINT",
    datatype: "int"
  })

  referencedTableSchema = Str({
    column: "REFERENCED_TABLE_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  referencedTableName = Str({
    column: "REFERENCED_TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  referencedColumnName = Str({
    column: "REFERENCED_COLUMN_NAME",
    datatype: "varchar",
    length: 64
  })
}

export class ReferentialConstraints extends Type {
  id = Primary({
    name: "REFERENTIAL_CONSTRAINTS",
    tableSchema: "information_schema"
  })

  constraintCatalog = Str({
    column: "CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  constraintName = Str({
    column: "CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  constraintSchema = Str({
    column: "CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  referencedTableName = Str({
    column: "REFERENCED_TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  tableName = Str({
    column: "TABLE_NAME",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintCatalog = Str({
    column: "UNIQUE_CONSTRAINT_CATALOG",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintName = Str({
    column: "UNIQUE_CONSTRAINT_NAME",
    datatype: "varchar",
    length: 64
  })

  uniqueConstraintSchema = Str({
    column: "UNIQUE_CONSTRAINT_SCHEMA",
    datatype: "varchar",
    length: 64
  })

  deleteRule = Str({
    column: "DELETE_RULE",
    datatype: "varchar"
  })

  matchOption = Str({
    column: "MATCH_OPTION",
    datatype: "varchar"
  })

  updateRule = Str({
    column: "UPDATE_RULE",
    datatype: "varchar"
  })
}