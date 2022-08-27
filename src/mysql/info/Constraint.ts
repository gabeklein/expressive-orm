import Entity from '../../Entity';
import Primary from '../../instruction/Primary';
import String from '../../instruction/String';
import Table from '../../instruction/Table';

class Constraint extends Entity {
  table = Table({
    name: "TABLE_CONSTRAINTS",
    schema: "information_schema"
  });

  id = Primary(false);

  catalog = String({
    column: 'CONSTRAINT_CATALOG',
    length: 64
  })

  enforced = String({
    column: 'ENFORCED',
    length: 3
  })

  name = String({
    column: 'CONSTRAINT_NAME',
    nullable: true,
    length: 64
  })

  schema = String({
    column: 'CONSTRAINT_SCHEMA',
    length: 64
  })

  tableName = String({
    column: 'TABLE_NAME',
    length: 64
  })

  tableSchema = String({
    column: 'TABLE_SCHEMA',
    length: 64
  })

  type = String({
    column: 'CONSTRAINT_TYPE',
    length: 11
  })
}

export default Constraint;