import Entity, { SQLiteConnection } from '../src';

const { format } = require('sql-formatter');

class DebugConnection extends SQLiteConnection {
  constructor(
    entities: Entity.Type[],
    public verbose?: boolean){

    super(entities);
  }

  query(qs: string){
    if(this.verbose)
      console.log(format(qs));

    return super.query(qs);
  }
}

export function bootstrap(
  entities: Entity.Type[], logs?: boolean){

  let db!: SQLiteConnection;

  beforeAll(async () => {
    db = new DebugConnection(entities, logs);
    await db.createTables();
  });

  afterAll(() => {
    db.close();
  });

  return db!;
}