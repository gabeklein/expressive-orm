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

  reset(){
    this.endStatement();
  }

  word(mustBe?: string){
    return this.assert("word", mustBe);
  }

  name(mustBe?: string){
    return this.assert(["word", "escaped"], mustBe);
  }

  error(){
    const token = this.look();
    const where = "line" in token ? ` at line ${token.line}` : "";
  
    throw new Error(`Unexpected ${token.type}` + where);
  }

  parens(required: true): string[];
  parens<T>(matchers: (() => T)[]): T[];
  parens(required?: boolean): string[] | undefined;
  parens<T = string>(argument?: boolean | Function[]){
    const collection = [] as T[];

    const scanner = () => {
      this.expect("lparen");
  
      while(true){
        if(this.maybe("rparen", true))
          break;
  
        let value: T;

        if(typeof argument == "object"){
          const matchers = argument.map(fn => () => value = fn())
          const match = this.try(...matchers);

          if(!match)
            this.error();
        }
        else
          value = this.expect([
            "number",
            "string",
            "escaped"
          ]) as T;
  
        collection.push(value!);

        this.maybe("comma", true);
      }
    }

    if(argument)
      scanner();
    else
      this.try(scanner);

    return collection;
  }

  statement = () => {
    const command = this.word();

    switch(command){
      case "USE": {
        this.database = this.expect("escaped");
        break;
      }
    }
    
    this.reset();
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

    this.parens([
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

    const columns = this.parens(true);

    for(const name of columns)
      focus.columns[name].primary = true;

    void columns, name;
  }

  setColumn = () => {
    const { focus } = this;
    const name = this.expect(["escaped", "word"]);
    const datatype = this.expect("word");

    const info = { name, datatype } as Parser.Column;

    info.argument = this.parens();

    while(true){
      if(this.maybe("comma", true) || this.maybe("rparen"))
        break;

      const next = this.expect("word");

      switch(next){
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

        case "DEFAULT": {
          const next = this.next();

          switch(next.type){
            case "string":
            case "number":
            case "word":
              info.default = next.value;
            break;

            case "lparen":
              throw new Error("DEFAULT expression not yet supported.");

            default:
              throw new Error(`Unexpected ${next.type}`);
          }

          break;
        }

        default:
          throw new Error(`Unexpected keyword ${next}`)
      }
    }
    
    focus.columns[name] = info;
  }
}

export default Parser;