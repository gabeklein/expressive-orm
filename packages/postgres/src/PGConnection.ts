import type { Connection } from '@expressive/sql';
import type { Pool, PoolConfig } from 'pg';

import { PostgresConnection } from './PostgresConnection';

export class PGConnection extends PostgresConnection {
  protected declare engine: Promise<Pool>;

  constructor(using: Connection.Types, connectionString: string)
  constructor(using: Connection.Types, config: PoolConfig)
  constructor(using: Connection.Types, pool: Pool)
  constructor(using: Connection.Types, arg2: string | PoolConfig | Pool) {
    super(using);

    this.engine = new Promise((resolve, reject) => {
      import("pg").then(({ default: { Pool } }) => {
        resolve(
          arg2 instanceof Pool ? arg2 : new Pool(
            typeof arg2 == "string" ? { connectionString: arg2 } : arg2
          )
        );
      }).catch((err) => {
        reject(new Error(`Attempted to load pg but failed: ${err.message}`));
      });
    });
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }> {
    const engine = await this.engine;
    const result = await engine.query(sql, params);
    return {
      rows: result.rows,
      affectedRows: result.rowCount || undefined
    };
  }

  async exec(sql: string): Promise<void> {
    await (await this.engine).query(sql);
  }

  async close(): Promise<void> {
    await (await this.engine).end();
    await super.close();
  }
}