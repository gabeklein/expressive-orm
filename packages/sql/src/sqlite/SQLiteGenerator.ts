import { DataTable } from '@expressive/orm';
import { Generator } from '../connection/Generator';

export class SQLiteGenerator extends Generator {
  protected jsonTable(table: DataTable): string {
    const param = this.param(table);
    const fields = Array.from(table.used, (field, i) => {
      return `value ->> ${i} ${this.escape(field.column)}`;
    });
    
    return `SELECT ${fields.join(', ')} FROM json_each(${param})`;
  }

  protected update(){
    const { updates, tables } = this.query;

    const [main] = updates.keys();

    if (!updates.size)
      return

    const output = [
      'UPDATE',
      this.escape(main),
      this.set(updates)
    ]

    if (tables.size > 1) {
      const using = Array.from(tables.values())
        .filter(table => table !== main)
        .map(table => {
          if (table.joins.length === 0)
            throw new Error(`Table ${table.name} has no joins.`);

          const conditions = table.joins
            .map(x => this.filter(x.left, x.op, x.right))
            .join(' AND ')

          return { conditions, table };
        });

      output.push(
        'FROM', using.map(x => x.table.name).join(', '),
        'WHERE', using.map(x => x.conditions).join(' AND ')
      )
    }

    return output;
  }

  protected limit(){
    const { limit, offset } = this.query;

    if (offset && !limit)
      return ["LIMIT -1", `OFFSET ${offset}`];

    return super.limit();
  }
}
