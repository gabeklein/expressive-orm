import { PGlite, PGliteOptions } from '@electric-sql/pglite';
import { Connection } from '@expressive/sql';

import { PostgresConnection } from './PostgresConnection';

export class PGLiteConnection extends PostgresConnection {
  protected engine!: PGlite;

  constructor(using: Connection.Types, engine: PGlite)
  constructor(using: Connection.Types, dataDir?: string, config?: PGliteOptions)
  constructor(using: Connection.Types, arg2?: string | PGlite, config?: PGliteOptions) {
    const pglite = arg2 instanceof PGlite ? arg2 : new PGlite(arg2, config);
    super(using, pglite);
  }

  async query(sql: string, params?: any[]) {
    return this.engine.query(sql, params);
  }

  async execScript(sql: string): Promise<void> {
    await this.engine.exec(sql);
  }

  async closeConnection(): Promise<void> {
    await this.engine.close();
  }
}