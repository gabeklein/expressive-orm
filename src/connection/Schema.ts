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
    columns: { [name: string]: Column };
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

  tables = {} as { [name: string]: Schema.Table };

  add(column: Schema.Column){
    const name = column.table;
    let table = this.tables[name];

    if(!table){
      this.tables[name] = table = {
        name,
        schema: column.schema,
        columns: {}
      };
    }

    table.columns[column.name] = column;
  }

  generate(specifySchema?: boolean){
    return generateEntities(this.tables, specifySchema);
  }
}

export default Schema;