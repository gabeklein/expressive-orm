import Scanner from "./Scanner";

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
  tables = {} as BunchOf<{}>;

  constructor(code: string){
    this.scan = new Scanner(code);
  }

  parse(){
    this.scan.next((token) => {
      const { type } = token;
  
      switch(type){
        case "word":
          this.statement(token.value);
          return;

        case "comment":
        case "space":
        case "newline":
        case "end":
          return;
  
        default:
          throw new Error(`Unexpected ${type}`)
      }
    })
  }

  statement(command: string){
    const { scan } = this;

    switch(command){
      case "INSERT":
        return;
  
      case "CREATE": {
        const { value } = scan.expect("word");
  
        if(value === "TABLE")
          this.table();
  
        scan.endStatement();
        return;
      }
  
      case "ALTER":
        scan.endStatement();
      break;
  
      case "USE": {
        const name = scan.expect("escaped");
  
        if(!this.database)
          this.database = name.value;

        scan.endStatement();
        break;
      }
  
      case "DROP":
        scan.endStatement();
      break;
    }
  }

  table(){
    const { scan } = this;
    const name = scan.expect("escaped").value;
    const table: Parser.Table = {
      name,
      columns: {}
    };

    scan.expect("lparen");

    while(true){
      if(scan.nextIs("rparen", true))
        break;

      scan.nextIs("comma", true);
    
      if(scan.nextIs("word")){
        this.constraint(table);
      }
      else {
        const column = this.column();
  
        table.columns[column.name] = column;
      }
    }
    
    scan.expect("semi");

    this.tables[name] = table;
  
    return {};
  }

  constraint(table: Parser.Table){
    const { scan } = this;

    if(scan.expect("word").value !== "CONSTRAINT")
      throw new Error(`Unexpected thing.`)

    scan.expect("escaped");
    scan.expect("word");
    scan.expect("word");
    scan.expect("lparen");

    const name = scan.expect("escaped").value;

    scan.expect("rparen");

    table.columns[name].primary = true;
  }

  column(){
    const { scan } = this;

    const name = scan.expect(["escaped", "word"]).value;
    const datatype = scan.expect("word").value;

    const info = { name, datatype } as Parser.Column;

    if(scan.nextIs("lparen"))
      info.argument = this.typeAttributes();

    while(true){
      if(scan.nextIs("comma", true) || scan.nextIs("rparen"))
        break;

      const next = scan.expect("word");

      switch(next.value){
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
          info.comment = scan.expect(["string", "quote"]).value;
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
          throw new Error(`Unexpected keyword ${next.value}`)
      }
    }
    
    return info;
  }

  typeAttributes(){
    const { scan } = this;
    const list = [] as any[];

    scan.expect("lparen");

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