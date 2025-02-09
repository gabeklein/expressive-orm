import { DataTable, Generator } from '@expressive/sql';
import { Parameter } from 'packages/sql/src/query/Builder';

export class PostgresGenerator extends Generator {
  toString(): string {
    const { returns, inserts } = this.query;
    const query = super.toString();

    if(inserts && returns)
      return query + (
        ' RETURNING ' + (
        returns instanceof Map
          ? Array
              .from(returns.entries())
              .map(([alias, field]) => `${this.toReference(field)} AS "${alias}"`)
          : this.toReference(returns)
        )
      )

    return query;
  }

  protected toJsonTable(table: DataTable){
    const param = this.toParam(table);
    const types = Array.from(table.used.entries())
      .map(([key, field]) => `"${key}" ${field.datatype}`);

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

  protected toInsert() {
    const { inserts, tables } = this.query;

    if (!inserts)
      return false;

    const [table, data] = inserts;

    const keys: string[] = [];
    const values: string[] = [];

    for (const [field, value] of data) {
      keys.push(this.escape(field.column));
      values.push(this.toReference(value as any) as string);
    }

    return [
      'INSERT INTO',
      this.escape(table.name),
      `(${keys})`,
      'SELECT',
      values.join(', '),
      tables.size > 1 && this.toFrom()
    ];
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
          'FROM', using.map(({ table }) => {
            const { alias, name } = table;
            return this.escape(alias ? `${name} ${alias}` : name);
          }).join(', '),
          'WHERE', using.map(x => x.conditions).join(' AND ')
        );
    }

    return output;
  }

  escape(name: unknown) {
    return String(name).split('.').map(x => `"${x}"`).join('.');
  }
}