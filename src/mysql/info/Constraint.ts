import Entity, { Primary, VarChar, Table } from '../../';

class Constraint extends Entity {
  table = Table({
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

export default Constraint;