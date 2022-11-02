declare namespace Schema {
  interface Column {
    name: string;
    dataType: string;
    // type: string;
    argument?: (string | number)[];
    comment?: string;
    default?: string | number;
    increment?: boolean;
    onUpdate?: string;
    nullable?: boolean;
    primary?: boolean;
    unique?: boolean;
    reference?: FKConstraint;
  }

  interface Table {
    name: string;
    schema: string;
    columns: { [name: string]: Column };
    primaryKeys?: string[];
  }

  interface FKConstraint {
    /** Name of constraint */
    name?: string;
    /** Column in referenced table */
    column: string;
    /** Referenced table */
    table: string;
    /** Action on delete of referenced row */
    onDelete?: string;
    /** Action on update of referenced row */
    onUpdate?: string;
  }
}

interface Schema {
  name: string;
  columns: Map<string, Schema.Column>;
  tables: { [name: string]: Schema.Table };
}

export default Schema;