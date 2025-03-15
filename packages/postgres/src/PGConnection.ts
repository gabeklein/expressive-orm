import { Connection } from '@expressive/sql';
import type { Pool, PoolConfig } from 'pg';

import { PostgresConnection } from './PostgresConnection';

export class PGConnection extends PostgresConnection {
  protected engine!: Pool;

  constructor(using: Connection.Types, connectionString: string)
  constructor(using: Connection.Types, config: PoolConfig)
  constructor(using: Connection.Types, pool: Pool)
  constructor(using: Connection.Types, arg2: string | PoolConfig | Pool) {
    let pg: { Pool: typeof Pool };

    try {
      pg = require('pg');
    } catch (e) {
      throw new Error(
        'The "pg" module is required but not installed. ' +
        'Please install it by running: npm install pg'
      );
    }

    const pool =
      typeof arg2 === 'string' ? new pg.Pool({ connectionString: arg2 }) :
      arg2 instanceof pg.Pool ? arg2 :
      new pg.Pool(arg2);
   
    super(using, pool);
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }> {
    const result = await this.engine.query(sql, params);
    return {
      rows: result.rows,
      affectedRows: result.rowCount || undefined
    };
  }

  async execScript(sql: string): Promise<void> {
    await this.engine.query(sql);
  }

  async closeConnection(): Promise<void> {
    await this.engine.end();
  }
}