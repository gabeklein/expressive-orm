import type { Connection } from '@expressive/sql';
import type { Client, Notification, Pool, PoolClient, PoolConfig } from 'pg';

import { PostgresConnection } from './PostgresConnection';

type Queryable = Pool | PoolClient | Client;

const QUEUES = new WeakMap<object, Promise<unknown>>();

function pooled(client: object): client is Pool {
  return "totalCount" in client && "idleCount" in client;
}

function send(client: Queryable, sql: string, ...params: [any[]?]){
  const run = () => client.query(sql, ...params);

  if (pooled(client))
    return run();

  const prior = QUEUES.get(client);
  const next = prior ? prior.then(run) : run();

  QUEUES.set(client, next.catch(() => {}));

  return next;
}

export class PGConnection extends PostgresConnection {
  protected declare engine: Promise<Pool>;

  private owned = false;

  /**
   * Bind `using` to Postgres through `pg`. Construct with `PGConnection.new`.
   *
   * `arg2` is a connection string, a `PoolConfig` or a `Pool` - `close()` leaves a given `Pool` open.
   * `{ live: false }` turns off live rows, so no client is held for LISTEN.
   */
  constructor(using: Connection.Types, arg2: string | PoolConfig | Pool, options?: PostgresConnection.Options) {
    super(using, options);

    if (typeof arg2 == "object" && pooled(arg2))
      this._client = arg2;

    this.engine = new Promise((resolve, reject) => {
      import("pg").then(({ default: { Pool } }) => {
        if (arg2 instanceof Pool)
          return resolve(arg2);

        this.owned = true;
        resolve(new Pool(typeof arg2 == "string" ? { connectionString: arg2 } : arg2));
      }).catch((err) => {
        reject(new Error(`Attempted to load pg but failed: ${err.message}`));
      });
    });
  }

  protected async client(): Promise<Queryable> {
    return (this._journal()?.session as PoolClient | undefined) || this._session()?.client as Client | undefined || this.engine;
  }

  _admit(client: object){
    if (typeof (client as Client).query != "function")
      throw new TypeError("PGConnection runs a session on a pg Client or Pool - this has no query().");
  }

  #pool(){
    const client = this._session()?.client as Pool | Client | undefined;

    return !client ? this.engine : pooled(client) ? client : undefined;
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }> {
    const result = await send(await this.client(), sql, params);
    return {
      rows: result.rows,
      affectedRows: result.rowCount || undefined
    };
  }

  async exec(sql: string): Promise<void> {
    await send(await this.client(), sql);
  }

  protected async lock(){
    return await this.#pool() ? () => {} : super.lock();
  }

  protected async idle(){
    if (!await this.#pool())
      await super.idle();
  }

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    const pool = await this.#pool();
    const client = pool ? await pool.connect() : this._session()!.client as Client;
    let broken: Error | undefined;

    const control = (sql: string) => send(client, sql).catch((error: Error) => {
      throw broken = error;
    });

    this._journal()!.session = client;

    try {
      await control("BEGIN");

      try {
        const result = await fn();

        await control("COMMIT");

        return result;
      }
      catch (error) {
        if (!broken)
          await control("ROLLBACK").catch(() => {});

        throw error;
      }
    }
    finally {
      if (pool)
        (client as PoolClient).release(broken);
    }
  }

  protected async listen(channel: string, callback: (payload: string) => void) {
    const client = await (await this.engine).connect();
    const notify = (message: Notification) => callback(message.payload!);

    client.on('notification', notify);
    await client.query(`LISTEN ${channel}`);

    return async () => {
      client.off('notification', notify);
      await client.query(`UNLISTEN ${channel}`);
      client.release();
    };
  }

  async close(): Promise<void> {
    await super.close();

    const engine = await this.engine;

    if (this.owned)
      await engine.end();
  }
}