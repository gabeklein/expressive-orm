import { DataTable, Generator } from '@expressive/sql';

export class SQLiteGenerator extends Generator {
  protected toJsonTable(table: DataTable): string {
    const param = this.toParam(table);
    const fields = Array.from(table.used.entries())
      .map(([key], i) => `value ->> ${i} ${this.escape(key)}`);
    
    return `SELECT ${fields.join(', ')} FROM json_each(${param})`;
  }

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
          if (table.joins.length === 0)
            throw new Error(`Table ${table.name} has no joins.`);

          const conditions = table.joins
            .map(x => this.toFilter(x.left, x.op, x.right))
            .join(' AND ')

          return { conditions, table };
        });

      if (using.length > 0)
        output.push(
          'FROM', using.map(x => x.table.name).join(', '),
          'WHERE', using.map(x => x.conditions).join(' AND ')
        )
    }

    return output;
  }
}