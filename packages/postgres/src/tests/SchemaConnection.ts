import { PostgresConnection } from '../PostgresConnection';

export class SchemaConnection extends PostgresConnection {
  async query() {
    return { rows: [] as any[] };
  }

  async exec() {}

  async listen() {
    return async () => {};
  }
}
