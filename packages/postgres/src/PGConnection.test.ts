import { afterEach, describe, expect, it } from 'bun:test';

import { Table } from '.';
import { PGConnection } from './PGConnection';

describe('PGConnection', () => {
  class TestType extends Table {}

  afterEach(() => {
    delete TestType.connection;
  });

  it('throw ECONNREFUSED', async () => {
    const conn = new PGConnection([TestType], 'postgresql://localhost');
    
    const prepared = conn.prepare('SELECT * FROM test');
    
    // Bun surfaces the connection failure as an AggregateError with an empty
    // message but a populated `code`, unlike node-postgres under node.
    await expect(prepared.all()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});