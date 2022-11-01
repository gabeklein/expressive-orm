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
    unique?: boolean;
    comment?: string;
    increment?: boolean;
  }
}

class Parser extends Scanner {
  database?: string;
  focus!: Parser.Table;
  tables = {} as BunchOf<{}>;

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
        this.database = this.expect("escaped");
        break;
      }

      case "CREATE": {
        this.try(this.createTable);
        break;
      }
    }
    
    this.endStatement();
  }

  createTable(){
    this.word("TABLE");
  
    const name = this.expect("escaped");

    const table: Parser.Table = {
      name,
      columns: {}
    };

    this.focus = table;
    this.tables[name] = table;

    this.inParenthesis([
      this.setColumn, 
      this.setPrimaryKey
    ]);

    this.expect("semi");
  }

  setPrimaryKey(){
    this.word("CONSTRAINT");
    this.name();
    this.word("PRIMARY");
    this.word("KEY");

    this.focus.primary = this.inParenthesis([
      () => this.expect("escaped")
    ]);
  }

  setColumn(){
    const name = this.name();
    const datatype = this.word();

    const info: Parser.Column = { name, datatype };

    info.argument = this.inParenthesis();

    loop: while(true){
      const next = this.maybe("word", true);

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

        default:
          throw this.error(`Unexpected keyword ${next}`, true);
      }
    }
    
    this.focus.columns[name] = info;
  }
}

export default Parser;