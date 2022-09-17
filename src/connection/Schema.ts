import { generateEntities } from "../generate/entities";

declare namespace Schema {
  interface Column {
    name: string;
    schema: string;
    table: string;
    type: string;
    maxLength?: number;
    nullable: boolean;
    primary?: boolean;
    reference?: Reference;
    values?: string[];
  }

  interface Table {
    name: string;
    schema: string;
    columns: Map<string, Column>;
  }

  interface Reference {
    table: string;
    column: string;
    name?: string;
    deleteRule?: string;
    updateRule?: string;
  }
}

class Schema {
  constructor(public name: string){}

  tables = new Map<string, Schema.Table>();

  add(column: Schema.Column){
    const name = column.table;
    let table = this.tables.get(name);

    if(!table){
      table = {
        name,
        schema: column.schema,
        columns: new Map<string, Schema.Column>()
      }
      
      this.tables.set(name, table);
    }

    table.columns.set(column.name, column);
  }

  generate(specifySchema?: boolean){
    return generateEntities(this.tables, specifySchema);
  }
}

export default Schema;