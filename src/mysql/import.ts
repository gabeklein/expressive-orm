import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';

// import Referential from './info/Referential';

export async function getTables(schema: string){
  const query = new Query($ => {
    const column = $.from(Column);
    const usage = $.join(KeyColumnUsage, "left");
    // const refCon = $.join(Referential, "left");

    usage.tableSchema.is(column.schema);
    usage.tableName.is(column.tableName);
    usage.columnName.is(column.name);

    // refCon.
    
    //.constraintName.is(usage.constraintName);

    return () => {
      const {
        constraintName,
        referencedTableName,
        referencedColumnName
      } = usage;

      // const {
      //   deleteRule,
      //   updateRule
      // } = refCon;

      let reference;
      let primary;

      if(constraintName == "PRIMARY")
        primary = true;
        
      else if(referencedTableName)
        reference = {
          table: referencedTableName,
          column: referencedColumnName,
          name: constraintName,
          // deleteRule,
          // updateRule
        }
      
      return {
        table: column.tableName,
        column: column.name,
        type: column.dataType,
        maxLength: column.maxLength,
        reference,
        primary
      }
    }
  })

  console.log(query.toString());

  return query.get();
}

// export async function getTables(schema: string){
//   const qColumns = Column.query({
//     where(){
//       this.schema.is(schema);
//     },
//     select(){
//       const {
//         name,
//         tableName,
//         schema,
//         dataType,
//         size,
//         isNullable,
//         key
//       } = this;

//       return <Schema.Column>{
//         name,
//         schema,
//         table: tableName,
//         type: dataType,
//         size,
//         nullable: isNullable == "YES",
//         primary: key === "PRI"
//       }
//     }
//   });

//   const constraints = await Constraint
//     .select("*")
//     .where({ schema })
//     .get();
    
//   const columns = await qColumns.get();
//   const tables = new Map<string, Schema.Table>();

//   for(const column of columns){
//     const name = column.table;
//     let table = tables.get(name);

//     if(!table){
//       table = {
//         name,
//         schema: column.schema,
//         columns: []
//       }
      
//       tables.set(name, table);
//     }

//     table.columns.push(column);
//   }

//   return generateEntities(...tables.values());
// }

