import { DataTable, Generator, Parameter } from '@expressive/sql';

export class PostgresGenerator extends Generator {
  toString(): string {
    const { returns, inserts } = this.query;
    const query = super.toString();

    if(inserts.size && returns)
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
    const types = Array.from(table.used, field => {
      return `"${field.column}" ${field.datatype}`;
    });

    table.toParam = () => table.output;
    
    return `SELECT * FROM json_to_recordset(${param}) AS x(${types})`;
  }

  protected toParam(from: Parameter): string {
    return '$' + (this.query.params.indexOf(from) + 1);
  }

  protected toWith(): string | undefined {
    if(this.query.updates.size)
      return super.toWith();
    
    return undefined;
  }

  protected toFrom(){
    const [main] = this.query.tables.values();

    if(main instanceof DataTable){
      const param = this.toParam(main);
      const types = Array.from(main.used, field => {
        return `"${field.column}" ${field.datatype}`;
      });

      main.toParam = () => main.output;
      
      return [
        `FROM json_to_recordset(${param})`,
        `AS "input" (${types})`
      ];
    }

    return super.toFrom();
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
      const using = Array
        .from(tables.values())
        .filter(table => table !== main)
        .map(table => ({
          table,
          conditions: table.joins
            .map(x => this.toFilter(x.left, x.op, x.right))
            .join(' AND ')
        }));

      if (using.length)
        output.push(
          'FROM', using.map(({ table: { alias, name} }) => {
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