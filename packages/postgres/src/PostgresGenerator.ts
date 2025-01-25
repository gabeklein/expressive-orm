import { DataTable, Generator } from '@expressive/sql';

export class PostgresGenerator extends Generator {
  protected toWith(){
    const cte = [] as string[];

    this.query.tables.forEach((table) => {
      if(!(table instanceof DataTable)) return;
     
      const fields: string[] = [];
      const types: string[] = [];
      const param = "$" + (table.index + 1);
      
      for(const [key, field] of table.used) {
        fields.push(key);
        types.push(key + ' ' + field.datatype);
      }
     
      cte.push(`${this.escape(table)} AS (SELECT * FROM json_to_recordset(${param}) AS x(${types}))`);

      table.toParam = () => Array.from(table.input).map(x => {
        const subset = {} as Record<string, any>;

        for(const [key] of table.used)
          subset[key as string] = x[key];

        return subset;
      })
    });
    

    if(cte.length)
      return 'WITH' + cte.join(", ");
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
          conditions: table.joins.map(([left, op, right]) => 
            `${this.escape(left)} ${op} ${this.escape(right)}`
          ).join(' AND ')
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