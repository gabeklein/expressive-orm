import { Connection } from "..";
import { generateEntities } from "../generate/entities";

declare namespace Schema {
  interface Column {
    name: string;
    schema: string;
    tableName: string;
    dataType: string;
    type: string;
    isNullable: boolean;
    isPrimary: boolean;
    reference?: Reference;
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
  constructor(
    public connection: Connection,
    public name: string,
    columns: Schema.Column[]){

    this.load(columns);
  }

  tables = {} as { [name: string]: Schema.Table };

  load(columns: Schema.Column[]){
    type Register = (column: Schema.Column) => void;

    const { tables } = this;
    const paths = new Map<string, Schema.Column | Register>();

    columns.forEach(column => {
      const { name, schema, tableName } = column;
      let info = tables[tableName];

      if(!info)
        info = tables[tableName] = {
          columns: {},
          name: tableName,
          schema
        };

      info.columns[name] = column;
      paths.set(`${tableName}.${name}`, column);
    })
  }

  generate(){
    return generateEntities(this);
  }
}

export default Schema;