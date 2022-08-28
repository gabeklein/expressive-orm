import { generateEntities, Schema } from '../generate/entities';
import Column from './info/Column';
import Constraint from './info/Constraint';

export async function getTables(schema: string){
  const qColumns = Column.query({
    where(){
      this.schema.is(schema);
    },
    select(){
      const {
        name,
        tableName,
        dataType,
        size,
        isNullable,
        key
      } = this;

      return <Schema.Column>{
        name,
        table: tableName,
        type: dataType,
        size,
        nullable: isNullable == "YES",
        primary: key === "PRI"
      }
    }
  });

  const constraints = await Constraint
    .select("*")
    .where({ schema })
    .get();
    
  const columns = await qColumns.get();
  const tables = new Map<string, Schema.Table>();

  for(const column of columns){
    const name = column.table;
    let table = tables.get(name);

    if(!table){
      table = {
        name,
        columns: []
      }
      
      tables.set(name, table);
    }

    table.columns.push(column);
  }

  return generateEntities(...tables.values());
}

