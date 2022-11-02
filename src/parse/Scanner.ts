import moo from "moo";
import { Symbols, matchers } from "./grammar";

declare namespace Scanner {
  type Type = Symbols;

  type Token<T extends Type = Type> = moo.Token & { type: T };

  type Node = Token | { type: "end", value: undefined };

  type Matcher<R = any> = {
    [P in Type]?: (token: Token) => R;
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

  word(required: false): string | undefined;
  word(value?: string, strict?: boolean): string;
  word(arg1?: string | false, arg2?: boolean){
    if(arg1 === false)
      return this.maybe("word", true);

    return this.assert("word", arg1, arg2);
  }

  name(required: false): string | undefined;
  name(value?: string, strict?: boolean): string;
  name(arg1?: string | false, arg2?: boolean){
    if(arg1 === false)
      return this.maybe("word", true);

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

  maybe(type: Scanner.Type | Scanner.Type[], advance?: boolean){
    this.skip();

    const next = this.look();
    const match = typeof type == "string"
      ? type === next.type
      : type.includes(next.type)

    if(!match)
      return;
    
    if(advance)
      this.next();

    return next.value;
  }

  assert(
    type: Scanner.Type | Scanner.Type[],
    value?: string | string[],
    fatal?: boolean){

    const got = this.expect(type);

    if(!value || value === got || Array.isArray(value) && value.includes(got))
      return got;

    throw this.error(`Token ${type} has value \`${got}\`, expected \`${value}\``, fatal);
  }

  expect<T extends Scanner.Type>(expect: T | T[], ignoreWhitespace: boolean): Scanner.Token<T>["value"];
  expect<T extends Scanner.Type>(expect: T | T[], ignore?: Scanner.Type[]): Scanner.Token<T>["value"];
  expect<R>(match: Scanner.Matcher<R>): R;
  expect(
    filter?: Scanner.Type | Scanner.Type[] | Scanner.Matcher,
    ignore?: Scanner.Type[] | boolean){

    if(ignore !== false)
      this.skip(ignore);

    const token = this.next();
    const type = token.type as Scanner.Type;

    if(Array.isArray(filter)){
      if(filter.includes(type))
        return token.value;
    }
    else if(typeof filter == "object"){
      const handle = filter[type];

      if(handle)
        return handle(token as any);
    }
    else if(type == filter)
      return token.value;

    throw this.unexpected(token);
  }

  skip(types?: Scanner.Type[] | true){
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

  unexpected(token?: Scanner.Node){
    if(!token)
      token = this.look();

    const where = "line" in token ? ` at line ${token.line}` : "";

    return this.error(`Unexpected ${token.type}` + where);
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
  
        let value: T;

        if(typeof argument == "object"){
          const match = this.try(...argument);

          if(match === false)
            throw this.unexpected();
          else
            value = match as T;
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
      scan();
    else
      this.try(scan);

    return collection;
  }
}

export default Scanner;