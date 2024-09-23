import { Connection } from '@expressive/sql';

class SQLite extends Connection {
  database?: string;

  constructor(opts: Connection.SQLiteConfig = {
    filename: ':memory:'
  }){
    super({
      client: 'sqlite3',
      connection: opts,
      useNullAsDefault: true
    });
  }
}

export { SQLite }