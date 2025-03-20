import { PGlite, PGliteOptions } from '@electric-sql/pglite';
import { Connection } from '@expressive/sql';

import { PostgresConnection } from './PostgresConnection';

export class PGLiteConnection extends PostgresConnection {
  protected engine!: PGlite;
  readonly dataDir: string;

  constructor(using: Connection.Types, engine: PGlite)
  constructor(using: Connection.Types, dataDir?: string, config?: PGliteOptions)
  constructor(using: Connection.Types, arg2?: string | PGlite, config?: PGliteOptions) {
    let engine: PGlite;
    let dataDir: string;

    if(arg2 instanceof PGlite) {
      engine = arg2;
      dataDir = arg2.dataDir || ":memory:";
    }
    else {
      engine = new PGlite(arg2 as string, config);
      dataDir = arg2 as string;
    }
    
    super(using, engine);
    this.dataDir = dataDir;
  }

  async sync(fix?: boolean): Promise<this> {
    if(this.dataDir === ":memory:")
      fix = fix !== false;

    return super.sync(fix);
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