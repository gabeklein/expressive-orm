import { matchers } from './grammar';
import Scanner from './Scanner';

type BunchOf<T = any> = { [key: string]: T }

declare namespace Parser {
  interface Table {
    name: string;
    columns: BunchOf<Column>;
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
    super(matchers, code);

    while(true){
      this.skip();
      
      const match = this.try(
        this.createTable,
        this.statement
      );

      if(!match)
        break;
    }
  }

  word(mustBe?: string){
    return this.assert("word", mustBe);
  }

  name(mustBe?: string){
    return this.assert(["word", "escaped"], mustBe);
  }

  statement = () => {
    const command = this.word();

    switch(command){
      case "USE": {
        this.database = this.expect("escaped");
        break;
      }
    }
    
    this.endStatement();
  }

  createTable = () => {
    this.word("CREATE");
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

  setPrimaryKey = () => {
    const { focus } = this;

    this.word("CONSTRAINT");

    const name = this.name();

    this.word("PRIMARY");
    this.word("KEY");

    const columns = this.inParenthesis(true);

    for(const name of columns)
      focus.columns[name].primary = true;

    void columns, name;
  }

  setColumn = () => {
    const { focus } = this;
    const name = this.expect(["escaped", "word"]);
    const datatype = this.expect("word");

    const info = { name, datatype } as Parser.Column;

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
          throw new Error(`Unexpected keyword ${next}`)
      }
    }
    
    focus.columns[name] = info;
  }
}

export default Parser;