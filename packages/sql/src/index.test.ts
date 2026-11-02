import { expect, it } from 'vitest';

import * as orm from '@expressive/orm';
import * as sql from './index';

it('will re-export @expressive/orm', () => {
  for (const key in orm)
    if (key !== 'default' && key !== 'Connection')
      expect(sql[key as keyof typeof sql]).toBe(orm[key as keyof typeof orm]);
});

it('will extend the Connection of @expressive/orm', () => {
  expect(sql.Connection.prototype).toBeInstanceOf(orm.Connection);
});
