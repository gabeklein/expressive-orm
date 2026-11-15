import type { Connection } from '@expressive/sql';
import type { Client, Notification, Pool, PoolClient, PoolConfig } from 'pg';

import { PostgresConnection } from './PostgresConnection';

export class PGConnection extends PostgresConnection {
  protected declare engine: Promise<Pool>;

  private owned = false;

  constructor(using: Connection.Types, arg2: string | PoolConfig | Pool) {
    super(using);

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

  protected async client(): Promise<Pool | PoolClient | Client> {
    return (this._journal()?.session as PoolClient | undefined) || this._session()?.client as Client | undefined || this.engine;
  }

  async #pool(){
    const client = this._session()?.client as Pool | Client | undefined;

    if (!client)
      return this.engine;

    const { default: { Pool } } = await import("pg");

    return client instanceof Pool ? client : undefined;
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }> {
    const engine = await this.client();
    const result = await engine.query(sql, params);
    return {
      rows: result.rows,
      affectedRows: result.rowCount || undefined
    };
  }

  async exec(sql: string): Promise<void> {
    await (await this.client()).query(sql);
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

    const send = (sql: string) => client.query(sql).catch((error: Error) => {
      throw broken = error;
    });

    this._journal()!.session = client;

    try {
      await send("BEGIN");

      try {
        const result = await fn();

        await send("COMMIT");

        return result;
      }
      catch (error) {
        if (!broken)
          await send("ROLLBACK").catch(() => {});

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