import type { PGlite, PGliteOptions } from '@electric-sql/pglite';
import type { Connection } from '@expressive/sql';

import { PostgresConnection } from './PostgresConnection';

export class PGLiteConnection extends PostgresConnection {
  protected declare engine: Promise<PGlite>;
  dataDir?: string;

  private owned = false;

  constructor(using: Connection.Types, arg2?: string | PGlite, config?: PGliteOptions) {
    super(using);

    this.engine = new Promise((resolve, reject) => {
      import('@electric-sql/pglite').then(({ PGlite }) => {
        if(arg2 instanceof PGlite) {
          resolve(arg2);
          this.dataDir = arg2.dataDir || ":memory:";
        }
        else {
          this.owned = true;
          this.dataDir = arg2 as string;
          resolve(new PGlite(this.dataDir, config));
        }
      }).catch(err => {
        reject(new Error(`Failed to load PGlite: ${err.message}`));
      });
    });
  }

  async query(sql: string, params?: any[]) {
    return (await this.engine).query(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await (await this.engine).exec(sql);
  }

  protected async listen(channel: string, callback: (payload: string) => void) {
    return (await this.engine).listen(channel, callback);
  }

  async close(): Promise<void> {
    await super.close();

    const engine = await this.engine;

    if (this.owned)
      await engine.close();
  }
}