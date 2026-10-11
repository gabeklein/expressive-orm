import { afterEach, describe, expect, it } from 'vitest';

import { Type } from '@expressive/orm';

import { PGConnection } from './PGConnection';

describe('PGConnection', () => {
  class TestType extends Type {}

  afterEach(() => {
    Reflect.deleteProperty(TestType, "connection");
  });

  it('throw ECONNREFUSED', async () => {
    const conn = new PGConnection([TestType], 'postgresql://localhost');
    
    const prepared = conn.prepare('SELECT * FROM test');
    
    // Bun surfaces the connection failure as an AggregateError with an empty
    // message but a populated `code`, unlike node-postgres under node.
    await expect(prepared.all()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});