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
     
      cte.push(`${table} AS (SELECT ${fields} FROM json_to_recordset(${param}) AS x(${types}))`);
      table.data = () => {
        return Array.from(table.input).map(x => {
          const subset = {} as Record<string, any>;
          for(const [key] of table.used)
            subset[key as string] = x[key]
          return subset;
        })
      }
    });
    

    if(cte.length)
      this.add('WITH', cte.join(", "));
  }

  protected toUpdate() {
    const { updates, tables } = this.query;
    const [main] = updates.keys();

    if (!updates.size) return;

    this.add('UPDATE', this.escape(main));
    this.toSet(updates);

    if (tables.size > 1) {
      const using = Array.from(tables.values())
        .filter(table => table !== main)
        .map(table => ({
          table,
          conditions: table.joins.map(([left, op, right]) => 
            `${this.escape(left)} ${op} ${this.escape(right)}`
          ).join(' AND ')
        }));

      if (using.length) {
        this.add('FROM', using.map(({ table }) => table).join(', '));
        this.add('WHERE', using.map(x => x.conditions).join(' AND '));
      }
    }

    return true;
  }

  escape(name: unknown) {
    return String(name).split('.').map(x => `"${x}"`).join('.');
  }
}