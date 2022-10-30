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

class Parser {
  scan: Scanner;

  database?: string;
  focus!: Parser.Table;
  tables = {} as BunchOf<{}>;

  constructor(code: string){
    const scan = this.scan = new Scanner(matchers, code);

    while(true){
      scan.skip();
      
      const match = scan.try(
        this.createTable,
        this.statement
      );

      if(!match)
        break;
    }
  }

  reset(){
    this.scan.endStatement();
  }

  word(mustBe?: string){
    return this.scan.assert("word", mustBe);
  }

  name(mustBe?: string){
    return this.scan.assert(["word", "escaped"], mustBe);
  }

  expect(type: Scanner.Type){
    return this.scan.expect(type);
  }

  error(){
    const token = this.scan.look();
    const where = "line" in token ? ` at line ${token.line}` : "";
  
    throw new Error(`Unexpected ${token.type}` + where);
  }

  parens(required: true): string[];
  parens<T>(matchers: (() => T)[]): T[];
  parens(required?: boolean): string[] | undefined;
  parens<T = string>(argument?: boolean | Function[]){
    const { scan } = this;
    const collection = [] as T[];

    const scanner = () => {
      this.expect("lparen");
  
      while(true){
        if(scan.maybe("rparen", true))
          break;
  
        let value: T;

        if(typeof argument == "object"){
          const matchers = argument.map(fn => () => value = fn())
          const match = this.scan.try(...matchers);

          if(!match)
            this.error();
        }
        else
          value = scan.expect([
            "number",
            "string",
            "escaped"
          ]) as T;
  
        collection.push(value!);

        scan.maybe("comma", true);
      }
    }

    if(argument)
      scanner();
    else
      scan.try(scanner);

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
    const { scan } = this;

    this.word("CREATE");
    this.word("TABLE");
  
    const name = this.expect("escaped");

    this.expect("lparen");

    const table: Parser.Table = {
      name,
      columns: {}
    };

    this.focus = table;
    this.tables[name] = table;

    while(true){
      if(scan.maybe("rparen", true))
        break;

      scan.maybe("comma", true);
      scan.try(this.setColumn, this.setPrimaryKey);
    }

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
    const { scan, focus } = this;
    const name = scan.expect(["escaped", "word"]);
    const datatype = scan.expect("word");

    const info = { name, datatype } as Parser.Column;

    info.argument = this.parens();

    while(true){
      if(scan.maybe("comma", true) || scan.maybe("rparen"))
        break;

      const next = scan.expect("word");

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
          info.comment = scan.expect(["string", "quote"]);
        break;

        case "DEFAULT": {
          const next = scan.next();

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

  typeAttributes(){
    const { scan } = this;
    const list = [] as any[];

    this.expect("lparen");

    scan: while(true){
      const next = scan.next();

      switch(next.type){
        case "rparen":
          break scan;
        case "comma":
          continue scan;
        case "number":
        case "string":
          list.push(next.value);
      }
    }

    return list.length == 1 ? list[0] : list;
  }
}

export default Parser;