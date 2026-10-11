import { expect, it } from 'vitest';

import * as sql from '@expressive/sql';
import * as sqlite from './index';

it('will re-export @expressive/sql', () => {
  expect(sqlite).toEqual(sql);
  expect(sqlite.SQLiteConnection).toBe(sql.SQLiteConnection);
});
