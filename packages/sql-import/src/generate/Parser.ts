import { Scanner } from '@expressive/sql-import';

import { Schema } from './Schema';

type BunchOf<T = any> = { [key: string]: T }

class Parser extends Scanner {
  database?: string;
  focus?: Schema.Table;
  tables = {} as BunchOf<Schema.Table>;

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
      this.word("NOT", false);
      this.word("EXISTS");
    })

    const { database } = this;

    if(!database)
      throw new Error("Parser expects a databse. Did you forget USE command?")
  
    const name = this.name();
    const table: Schema.Table = {
      name,
      schema: database,
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

    switch(this.word()){
      case "PRIMARY": {
        this.word("KEY");
        this.word(false);
  
        table.primaryKeys = this.parens(true);

        break;
      }

      case "FOREIGN": {
        this.word("KEY");
  
        const [ column ] = this.parens(true);
  
        this.word("REFERENCES");
  
        const foreignTable = this.name();
        const [ foreignKey ] = this.parens(true);
  
        table.columns[column].reference = {
          name,
          column: foreignKey,
          table: foreignTable
        };

        break;
      }

      case "UNIQUE": {
        const keys = this.parens();
  
        for(const key in keys)
          table.columns[key].unique = true;
  
        break;
      }
    }
  }

  setColumn(){
    const name = this.expect("escaped");
    const dataType = this.word();
    const argument = this.parens();

    const info: Schema.Column = { name, dataType };

    if(argument?.length)
      info.argument = argument;

    this.try(() => {
      const isNot = this.word("NOT", false);
      this.word("NULL");
      info.nullable = !isNot;
    })

    let next;

    while(next = this.word(false)){
      switch(next){
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
          info.fallback = this.expect(["string", "number", "word"])
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

export { Parser }