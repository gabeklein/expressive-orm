import { PGlite } from '@electric-sql/pglite';
import { Connection } from '@expressive/sql';

import { PGLiteConnection } from './PGLiteConnection';

const shared = new PGlite();
let current: TestConnection | undefined;

afterEach(async () => {
  // clear the database
  await shared.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');

  if(current)
    for(const type of current.using)
      delete type.connection;
});

export class TestConnection extends PGLiteConnection {
  constructor(using: Connection.Types){
    super(using, shared);
    current = this;
  }
}