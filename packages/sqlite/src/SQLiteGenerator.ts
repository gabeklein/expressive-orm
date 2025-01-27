import { Generator } from '@expressive/sql';

export class SQLiteGenerator extends Generator {
  protected toUpdate(){
    const { updates, tables } = this.query;

    const [main] = updates.keys();

    if (!updates.size)
      return

    const output = [
      'UPDATE',
      this.escape(main),
      this.toSet(updates)
    ]

    if (tables.size > 1) {
      // TODO: maybe redundant with base class
      const using = Array.from(tables.values())
        .filter(table => table !== main)
        .map(table => {
          const { joins } = table;

          if (joins.length === 0)
            throw new Error(`Table ${table.name} has no joins.`);

          return {
            table,
            // TODO: consolidate this
            conditions: joins
              .map(({ left, op, right }) => this.toFilter(left, op, right))
              .join(' AND ')
          };
        });

      if (using.length > 0)
        output.push(
          'FROM', using.map(x => x.table).join(', '),
          'WHERE', using.map(x => x.conditions).join(' AND ')
        )
    }

    return output;
  }
}