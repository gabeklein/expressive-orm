import * as moo from "moo";
import { Symbols, matchers } from "./grammar";

declare namespace Scanner {
  type DataType = Symbols;

  type Token<T extends DataType = DataType> = moo.Token & { type: T };

  type Node = Token | { type: "end", value: undefined };

  type Matcher<R = any> = {
    [P in DataType]?: (token: Token) => R;
  }
}

const SyntaxError = new Map<Error, boolean>();

class Scanner {
  lexer: moo.Lexer;
  lookAhead?: Scanner.Node;
  buffer = [] as Scanner.Node[];
  cache?: Scanner.Node[];

  constructor(code: string){
    this.lexer = moo.compile(matchers).reset(code);
  }

  word(fatal?: true): string;
  word(required?: false): string | undefined;
  word(value: string | string[], fatal?: true): string;
  word(value?: string | string[], required?: boolean): string | undefined;
  word(arg1?: string | string[] | boolean, arg2?: boolean){
    if(typeof arg1 == "boolean")
      arg2 = arg1, arg1 = undefined;

    return this.assert("word", arg1, arg2);
  }

  name(fatal?: true): string;
  name(required?: false): string | undefined;
  name(value: string | string[], fatal?: true): string;
  name(value?: string | string[], required?: boolean): string | undefined;
  name(arg1?: string | string[] | boolean, arg2?: boolean){
    if(typeof arg1 == "boolean")
      arg2 = arg1, arg1 = undefined;

    return this.assert(["word", "escaped"], arg1, arg2);
  }

  try<T>(match: (this: this) => T): T;
  try(...matchers: ((this: this) => void)[]): boolean;
  try(...matchers: ((this: this) => any)[]){
    for(const match of matchers){
      const last = this.cache;
      const cache = [] as Scanner.Node[];
  
      try {
        this.cache = cache;
        const result = match.call(this) as any;

        return matchers.length > 1 ? true : result;
      }
      catch(err: any){
        if(SyntaxError.get(err) !== false)
          throw err;

        this.buffer = cache.concat(this.buffer);
      }
      finally {
        this.cache = last;
      }
    }

    return false;
  }

  one(...matchers: ((this: this) => void)[]): void {
    if(!this.try(...matchers))
      throw this.unexpected();
  }

  look(){
    let next = this.buffer[0];

    if(!next){
      next = this.next(true);
      this.buffer.push(next);
    }

    return next;
  }

  next(passive?: boolean){
    const next: any =
      this.buffer.shift() ||
      this.lexer.next() ||
      { type: "end", value: undefined };
    
    if(this.cache && !passive)
      this.cache.push(next);
  
    return next as Scanner.Node;
  }

  maybe(type: Scanner.DataType | Scanner.DataType[], advance?: boolean){
    this.skip();

    const next = this.look();

    if(!match(type, next.type))
      return;
    
    if(advance)
      this.next();

    return next.value;
  }

  assert(
    type: Scanner.DataType | Scanner.DataType[],
    value?: string | string[],
    fatal?: boolean){

    const got = this.expect(type, fatal);

    if(!got)
      return;

    if(!value || match(value, got))
      return got;

    throw this.error(`Token ${type} has value \`${got}\`, expected \`${value}\``, fatal);
  }

  expect<T extends Scanner.DataType>(expect: T | T[], fatal?: true): string;
  expect<T extends Scanner.DataType>(expect: T | T[], required?: boolean): string | undefined;
  expect(filter: Scanner.DataType | Scanner.DataType[], required?: boolean){
    this.skip();

    const token = this.look();

    if(match(filter, token.type))
      return this.next().value;

    if(required !== false)
      throw this.unexpected(required);
  }

  skip(types?: Scanner.DataType[] | true){
    let lookAhead;

    if(typeof types !== "object")
      types = ["comment", "newline", "space"];

    do {
      lookAhead = this.next(true);
    }
    while(types.includes(lookAhead.type));

    if(lookAhead.type == "end")
      return true;

    this.buffer.unshift(lookAhead);
  }

  endStatement(){
    while(true)
      if(["semi", "end"].includes(this.next().type))
        break;
  }

  error(message?: string, fatal?: boolean){
    const error = new Error(message);

    SyntaxError.set(error, fatal || false);

    return error;
  }

  unexpected(fatal?: boolean){
    const token = this.look();
    const where = "line" in token ? ` at line ${token.line}` : "";

    return this.error(`Unexpected ${token.type}` + where, fatal);
  }

  parens(required: true): string[];
  parens<T>(map: (() => T)[]): T[];
  parens(required?: boolean): string[] | undefined;
  parens<T = string>(argument?: boolean | (() => T)[]){
    const collection = [] as T[];

    const scan = () => {
      this.expect("lparen");
  
      while(true){
        if(this.maybe("rparen", true))
          break;
  
        let value: any;

        if(typeof argument == "object"){
          const match = this.try(...argument);

          if(match === false)
            throw this.unexpected();
          else
            value = match;
        }
        else
          value = this.expect([
            "number",
            "string",
            "escaped"
          ]);
  
        collection.push(value);

        this.maybe("comma", true);
      }
    }

    if(argument)
      scan();
    else
      this.try(scan);

    return collection;
  }
}

function match(a: string | string[], b: string){
  return Array.isArray(a) ? a.includes(b) : a === b;
}

export { Scanner }