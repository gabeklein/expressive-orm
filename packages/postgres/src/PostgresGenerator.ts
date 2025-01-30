import { DataTable, Generator } from '@expressive/sql';
import { Parameter } from 'packages/sql/src/query/Builder';

export class PostgresGenerator extends Generator {
  protected toJsonTable(table: DataTable){
    const param = this.toParam(table);
    const types = Array.from(table.used.entries())
      .map(([key, field]) => `${key} ${field.datatype}`);

    table.toParam = () => Array.from(table.input).map(x => {
      const subset = {} as Record<string, any>;
      for (const [key] of table.used) subset[key as string] = x[key];
      return subset;
    });
    
    return `SELECT * FROM json_to_recordset(${param}) AS x(${types})`;
  }

  protected toParam(from: Parameter): string {
    return '$' + (this.query.params.indexOf(from) + 1);
  }

  protected toUpdate() {
    const { updates, tables } = this.query;
    const [main] = updates.keys();

    if (!updates.size) return;

    const output = [
      'UPDATE',
      this.escape(main),
      this.toSet(updates)
    ]

    if (tables.size > 1) {
      const using = Array.from(tables.values())
        .filter(table => table !== main)
        .map(table => ({
          table,
          conditions: table.joins
            .map(x => this.toFilter(x.left, x.op, x.right))
            .join(' AND ')
        }));

      if (using.length)
        output.push(
          'FROM', using.map(({ table }) => this.escape(table)).join(', '),
          'WHERE', using.map(x => x.conditions).join(' AND ')
        );
    }

    return output;
  }

  escape(name: unknown) {
    return String(name).split('.').map(x => `"${x}"`).join('.');
  }
}