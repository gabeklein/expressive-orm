import { afterEach, describe, expect, it } from 'vitest';

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
    
    await expect(prepared.all()).rejects.toThrow('connect ECONNREFUSED');
  });
});