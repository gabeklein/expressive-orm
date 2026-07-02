import { PostgresConnection } from '../PostgresConnection';

// Concrete PostgresConnection for schema-only tests. The query/exec drivers are
// never exercised - these tests only read the schema generated at construction.
export class SchemaConnection extends PostgresConnection {
  async query() {
    return { rows: [] as any[] };
  }

  async exec() {}
}
