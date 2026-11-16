import type { PGlite, PGliteOptions } from '@electric-sql/pglite';
import type { Connection } from '@expressive/sql';

import { PostgresConnection } from './PostgresConnection';

const DATE = 1082;

export class PGLiteConnection extends PostgresConnection {
  protected declare engine: Promise<PGlite>;
  dataDir?: string;

  private owned = false;

  /**
   * Bind `using` to PGlite. Construct with `PGLiteConnection.new`.
   *
   * `arg2` is a data directory, in memory when omitted, or a `PGlite` - `close()` leaves a given one open.
   * `config` is `PGliteOptions` for a PGlite it opens, plus `live` - `{ live: false }` turns off live rows.
   */
  constructor(using: Connection.Types, arg2?: string | PGlite, config: PGliteOptions & PostgresConnection.Options = {}) {
    const { live, ...options } = config;

    super(using, { live });

    if (arg2 && typeof arg2 == "object")
      this._client = arg2;

    this.engine = new Promise((resolve, reject) => {
      import('@electric-sql/pglite').then(({ PGlite }) => {
        if(arg2 instanceof PGlite) {
          resolve(arg2);
          this.dataDir = arg2.dataDir || ":memory:";
        }
        else {
          this.owned = true;
          this.dataDir = arg2 as string;
          resolve(new PGlite(this.dataDir, options));
        }
      }).catch(err => {
        reject(new Error(`Failed to load PGlite: ${err.message}`));
      });
    });
  }

  _admit(client: object){
    if (typeof (client as PGlite).query != "function" || typeof (client as PGlite).exec != "function")
      throw new TypeError("PGLiteConnection runs a session on a PGlite - this has no query() and exec().");
  }

  #engine(){
    return this._session()?.client as PGlite | undefined || this.engine;
  }

  async query(sql: string, params?: any[]) {
    return (await this.#engine()).query(sql, params, { parsers: { [DATE]: (value: string) => value } });
  }

  async exec(sql: string): Promise<void> {
    await (await this.#engine()).exec(sql);
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