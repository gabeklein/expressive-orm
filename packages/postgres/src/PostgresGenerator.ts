import { Field } from '@expressive/orm';
import { DataTable, Parameter } from '@expressive/orm/driver';
import { Generator } from '@expressive/sql';

export function now(field?: Field){
  const utc = "(now() AT TIME ZONE 'UTC')";
  const { timezone } = (field || {}) as { timezone?: boolean };

  switch (field?.type) {
    case "date":
      return `${utc}::date`;
    case "time":
      return timezone ? "now()::timetz" : `${utc}::time`;
    default:
      return timezone ? "now()" : utc;
  }
}

export class PostgresGenerator extends Generator {
  protected now(field?: Field){
    return now(field);
  }

  protected jsonTable(table: DataTable){
    const param = this.param(table);
    const types = Array.from(table.used, field => {
      return `"${field.column}" ${field.datatype}`;
    });

    table.toParam = () => table.output;
    
    return `SELECT * FROM json_to_recordset(${param}) AS x(${types})`;
  }

  protected param(from: Parameter): string {
    return '$' + (this.query.params.indexOf(from) + 1);
  }

  protected with(): string | undefined {
    if(!this.query.updates.size)
      return undefined;

    return super.with();
  }

  protected from(){
    const [main] = this.query.tables.values();

    if(main instanceof DataTable){
      const param = this.param(main);
      const types = Array.from(main.used, field => {
        return `"${field.column}" ${field.datatype}`;
      });

      main.toParam = () => main.output;
      
      return [
        `FROM json_to_recordset(${param}) AS "input" (${types})`
      ];
    }

    return super.from();
  }

  protected update() {
    const { updates, tables } = this.query;
    const [ main ] = updates.keys();

    if (!updates.size) return;

    const output = [
      'UPDATE',
      this.table(main),
      this.set(updates)
    ]

    if (tables.size > 1) {
      const using = Array
        .from(tables.values())
        .filter(table => table !== main)
        .map(table => ({
          table,
          conditions: table.joins
            .map(x => this.filter(x.left, x.op, x.right))
            .join(' AND ')
        }));

      if (using.length)
        output.push(
          'FROM', using.map(({ table }) => this.table(table)).join(', '),
          'WHERE', using.map(x => x.conditions).join(' AND ')
        );
    }

    return output;
  }

  escape(name: unknown) {
    return String(name).split('.').map(x => `"${x}"`).join('.');
  }
}