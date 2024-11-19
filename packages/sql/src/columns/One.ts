import { Field } from '../Field';
import { Query } from '../Query';
import { Type } from '../Type';

declare namespace One {
  interface OrNull<T extends Type> extends One<T> {
    nullable: true;
  }
}

interface One<T extends Type> extends Field {
  datatype: "INT";
  type: Type.EntityType<T>;
}

function One<T extends Type>(type: Type.EntityType<T>, options?: One<T>): T;
function One<T extends Type>(type: Type.EntityType<T>, options: One.OrNull<T>): T | null | undefined;
function One<T extends Type>(options: One.OrNull<T>): T | null | undefined;
function One<T extends Type>(options: One<T>): T;
function One<T extends Type>(arg1: any, arg2?: any, arg3?: any): any {
  if(typeof arg2 == "string")
    arg2 = { column: arg2 };

  if(arg2 && typeof arg3 == "boolean")
    arg2.nullable = arg3;

  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return Field((key) => ({
    datatype: "int",
    type: arg1.type,
    column: underscore(key) + "_id",
    set(value: number | { id: number }){
      return typeof value == "object" ? value.id : value;
    },
    query(table, property){
      let inner: Query.From<T> | undefined;

      Object.defineProperty(table.proxy, property, {
        get: () => inner || (
          inner = table.query.table(arg1.type, {
            id: `${table.alias || table.name}.${this.column}`
          })
        )
      })
    },
    ...arg1
  }));
}

function underscore(str: string){
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

// class OneToManyRelation extends Field {
//   type!: Type.EntityType;
//   datatype = "INT";

//   init(options: Partial<this>){
//     super.init(options);

//     const foreign = this.type;
//     const foreignKey = "id";
//     const local = `FK_${foreign.name}${this.table.name}`;

//     this.table.deps.add(foreign);

//     if(!options.column)
//       this.column = decapitalize(foreign.name) + "Id";

//     this.constraint = sql`
//       ADD ${local && `CONSTRAINT ${escapeId(local)}`}
//       FOREIGN KEY (${this.column})
//       REFERENCES ${foreign.name}(${foreignKey})
//     `
//   }

//   proxy(query: Query.Callback){
//     let { type } = this;

//     const fk = `${type.table}.id`;
//     const lk = `${this.table.name}.${this.column}`;

//     // @ts-ignore
//     // TODO: fix this
//     const proxy = query(type, [`${fk} = ${lk}`], "left");

//     return () => proxy;
//   }
// }

export { One }