import type { PGlite, PGliteOptions } from '@electric-sql/pglite';
import type { Connection } from '@expressive/sql';

import { PostgresConnection } from './PostgresConnection';

export class PGLiteConnection extends PostgresConnection {
  protected declare engine: Promise<PGlite>;
  dataDir?: string;

  constructor(using: Connection.Types, engine: PGlite)
  constructor(using: Connection.Types, dataDir?: string, config?: PGliteOptions)
  constructor(using: Connection.Types, arg2?: string | PGlite, config?: PGliteOptions) {
    super(using);

    this.engine = new Promise((resolve, reject) => {
      import('@electric-sql/pglite').then(({ PGlite }) => {
        if(arg2 instanceof PGlite) {
          resolve(arg2);
          this.dataDir = arg2.dataDir || ":memory:";
        }
        else {
          this.dataDir = arg2 as string;
          resolve(new PGlite(this.dataDir, config));
        }
      }).catch(err => {
        reject(new Error(`Failed to load PGlite: ${err.message}`));
      });
    });
  }

  async sync(fix = true){
    return super.sync(fix);
  }

  async execute(sql: string, params?: any[]) {
    return (await this.engine).query(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await (await this.engine).exec(sql);
  }

  async close(): Promise<void> {
    await (await this.engine).close();
    await super.close();
  }
}