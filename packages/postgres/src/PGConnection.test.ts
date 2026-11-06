import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Type } from '@expressive/orm';
import pg from 'pg';

import { PGConnection } from './PGConnection';

describe('PGConnection', () => {
  class TestType extends Type {}

  afterEach(() => {
    Reflect.deleteProperty(TestType, "connection");
  });

  it('throw ECONNREFUSED', async () => {
    const conn = PGConnection.new([TestType], 'postgresql://localhost');
    
    const prepared = conn.prepare('SELECT * FROM test');
    
    await expect(prepared.all()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('will create missing tables when awaited', async () => {
    const pool = new pg.Pool();
    const query = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);

    vi.spyOn(pool, 'end').mockResolvedValue();

    const conn = await PGConnection.new([TestType], pool);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE "test_type"'));

    await conn.close();
  });

  it('will listen on a dedicated client', async () => {
    const pool = new pg.Pool();
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn()
    });

    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    vi.spyOn(pool, 'end').mockResolvedValue();

    const conn = PGConnection.new([TestType], pool);
    const listener = vi.fn();
    const stop = conn.subscribe(listener);

    await vi.waitFor(() => expect(client.query).toHaveBeenCalledWith('LISTEN expressive_orm'));

    for (const payload of ['not json', 'null', '{"foo":1}', '{"table":"test_type","op":"truncate","id":1}', '{"table":"test_type","op":"update"}'])
      client.emit('notification', { channel: 'expressive_orm', payload });

    expect(listener).not.toHaveBeenCalled();

    client.emit('notification', {
      channel: 'expressive_orm',
      payload: '{"table":"test_type","op":"update","id":1,"row":{"id":1}}'
    });

    expect(listener).toHaveBeenCalledWith({ table: "test_type", op: "update", id: 1, row: { id: 1 } });

    stop();
    await conn.close();

    expect(client.query).toHaveBeenLastCalledWith('UNLISTEN expressive_orm');
    expect(client.release).toHaveBeenCalled();
    expect(client.listenerCount('notification')).toBe(0);
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('will run a transaction on one client', async () => {
    class Item extends Type {}

    const pool = new pg.Pool();
    const query = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const client = {
      query: vi.fn(async (_sql: string) => ({ rows: [], rowCount: 1 })),
      release: vi.fn()
    };

    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    vi.spyOn(pool, 'end').mockResolvedValue();

    const conn = await PGConnection.new([Item], pool);

    query.mockClear();

    await conn.transaction(() => conn.prepare('UPDATE "item" SET id = id').run());
    await expect(conn.transaction(async () => {
      await conn.prepare('SELECT 1').all();
      throw new Error("nope");
    })).rejects.toThrow("nope");

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", 'UPDATE "item" SET id = id', "COMMIT", "BEGIN", "SELECT 1", "ROLLBACK"]);
    expect(client.release.mock.calls).toEqual([[undefined], [undefined]]);
    expect(query).not.toHaveBeenCalled();

    await conn.close();
    Reflect.deleteProperty(Item, "connection");
  });

  it('will run transactions side by side on separate clients', async () => {
    class Item extends Type {}

    const pool = new pg.Pool();
    const log: string[] = [];
    let opened = 0;

    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
    vi.spyOn(pool, 'end').mockResolvedValue();
    vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const name = String(++opened);

      return {
        query: vi.fn(async (sql: string) => {
          log.push(`${name} ${sql}`);
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn()
      } as never;
    });

    const conn = await PGConnection.new([Item], pool);
    const step = () => new Promise(resolve => setTimeout(resolve));

    await Promise.all([
      conn.transaction(step),
      conn.transaction(step),
      conn.prepare('SELECT 1').all()
    ]);

    expect(log).toEqual(["1 BEGIN", "2 BEGIN", "1 COMMIT", "2 COMMIT"]);

    await conn.close();
    Reflect.deleteProperty(Item, "connection");
  });

  it('will discard a client that failed to commit', async () => {
    class Item extends Type {}

    const pool = new pg.Pool();
    const failure = new Error("connection lost");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql == "COMMIT")
          throw failure;

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };

    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
    vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    vi.spyOn(pool, 'end').mockResolvedValue();

    const conn = await PGConnection.new([Item], pool);

    await expect(conn.transaction(() => {})).rejects.toBe(failure);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledWith(failure);

    await conn.close();
    Reflect.deleteProperty(Item, "connection");
  });

  it('will end a pool it created', async () => {
    const end = vi.spyOn(pg.Pool.prototype, 'end').mockResolvedValue();
    const conn = PGConnection.new([TestType], 'postgresql://localhost');

    await conn.close();

    expect(end).toHaveBeenCalled();
    end.mockRestore();
  });
});
