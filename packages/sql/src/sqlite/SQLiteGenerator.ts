import { Field } from '@expressive/orm';
import { DataTable } from '@expressive/orm/driver';
import { Builder } from '@expressive/orm/driver';
import { Generator } from '../connection/Generator';

export type Timestamps = "ms" | "seconds" | "iso";

export function now(field?: Field, timestamps: Timestamps = "ms"){
  switch (field?.type) {
    case "date":
      return "date('now')";
    case "time":
      return "time('now')";
  }

  switch (timestamps) {
    case "iso":
      return "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    case "seconds":
      return "CAST(strftime('%s', 'now') AS INTEGER)";
    default:
      return "CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)";
  }
}

export class SQLiteGenerator extends Generator {
  constructor(query: Builder, protected timestamps?: Timestamps){
    super(query);
  }

  protected now(field?: Field){
    return now(field, this.timestamps);
  }

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
    const clauses = super.limit();

    return offset && !limit ? ["LIMIT -1", ...clauses] : clauses;
  }
}
