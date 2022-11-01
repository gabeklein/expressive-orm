import Scanner from './Scanner';

type BunchOf<T = any> = { [key: string]: T }

declare namespace Parser {
  interface Table {
    name: string;
    columns: BunchOf<Column>;
    primary?: string[];
  }

  interface Column {
    name: string;
    datatype: string;
    primary?: boolean;
    argument?: string | number | string[];
    nullable?: boolean;
    default?: string | number;
    onUpdate?: string;
    unique?: boolean;
    comment?: string;
    increment?: boolean;
    constraint?: FKConstraint;
  }

  interface FKConstraint {
    /** Name of constraint */
    name?: string;
    /** Column in referring table */
    column: string;
    /** Table of foreign key */
    table: string;
    /** Column in foreign table */
    foreignKey: string;
  }
}

class Parser extends Scanner {
  database?: string;
  focus?: Parser.Table;
  tables = {} as BunchOf<Parser.Table>;

  constructor(code: string){
    super(code);

    while(true){
      if(this.skip())
        break;

      this.statement();
    }
  }

  statement(){
    const command = this.word();

    switch(command){
      case "USE": {
        this.database = this.name();
        break;
      }

      case "ALTER": {
        this.try(this.alterTable);
        break;
      }

      case "CREATE": {
        this.try(this.createTable);
        break;
      }
    }
    
    this.endStatement();
  }

  alterTable(){
    this.word("TABLE");

    const name = this.name();

    this.word("ADD");
    this.focus = this.tables[name]
    this.setConstraint();
    this.focus = undefined;
  }

  createTable(){
    this.word("TABLE");
    this.try(() => {
      this.word("IF");
      this.word("NOT EXISTS");
    })
  
    const name = this.name();

    const table: Parser.Table = {
      name,
      columns: {}
    };

    this.focus = table;
    this.tables[name] = table;

    this.parens([
      this.setColumn, 
      this.setConstraint
    ]);
  }

  setConstraint(){
    const table = this.focus!;
    const name = this.try(() => {
      this.word("CONSTRAINT");
      return this.name(false);
    });

    const primaryKeys = () => {
      this.word("PRIMARY");
      this.word("KEY");
      this.word(false);

      table.primary = this.parens(true);
    }

    const foreignKey = () => {
      this.word("FOREIGN");
      this.word("KEY");

      const [ column ] = this.parens(true);

      this.word("REFERENCES");

      const foreignTable = this.name();
      const [ foreignKey ] = this.parens(true);

      table.columns[column].constraint = {
        name,
        column,
        foreignKey,
        table: foreignTable
      };
    }

    const uniqueKey = () => {
      this.word("UNIQUE");

      const keys = this.parens();

      for(const key in keys)
        table.columns[key].unique = true;
    }

    this.one(
      primaryKeys,
      foreignKey,
      uniqueKey
    );
  }

  setColumn(){
    const name = this.expect("escaped");
    const datatype = this.word();
    const info: Parser.Column = { name, datatype };

    info.argument = this.parens();

    loop: while(true){
      const next = this.word(false);

      switch(next){
        case undefined:
          break loop;
        
        case "NOT NULL":
          info.nullable = false;
        break;

        case "NULL":
          info.nullable = true;
        break;

        case "UNIQUE":
          info.unique = true;
        break;

        case "PRIMARY":
          info.primary = true;
        break;

        case "AUTO_INCREMENT":
          info.increment = true;
        break;

        case "COMMENT":
          info.comment = this.expect(["string", "quote"]);
        break;

        case "DEFAULT":
          info.default = this.expect(["string", "number", "word"])
          break;

        case "ON": {
          this.word("UPDATE");
          info.onUpdate = this.expect(["string", "number", "word"])
          break;
        }

        default:
          throw this.error(`Unexpected keyword ${next}`, true);
      }
    }
    
    this.focus!.columns[name] = info;
  }
}

export default Parser;