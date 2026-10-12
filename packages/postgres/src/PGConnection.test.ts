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
    
    // Bun surfaces the connection failure as an AggregateError with an empty
    // message but a populated `code`, unlike node-postgres under node.
    await expect(prepared.all()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
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
    expect(pool.end).toHaveBeenCalled();
  });
});
