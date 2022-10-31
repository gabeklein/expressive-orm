import moo, { Rules } from "moo";
import { Symbols } from "./grammar";

declare namespace Scanner {
  type Type = Symbols;

  type Token<T extends Type = Type> = moo.Token & { type: T };

  type Node = Token | { type: "end", value: undefined };

  type Matcher<R = any> = {
    [P in Type]?: (token: Token) => R;
  }
}

class Scanner {
  lexer: moo.Lexer;
  lookAhead?: Scanner.Node;
  buffer = [] as Scanner.Node[];
  cache?: Scanner.Node[];

  constructor(
    public match: Rules,
    public code: string){

    this.lexer = moo.compile(match).reset(code);
  }

  try(...matchers: ((this: this) => void)[]){
    for(const match of matchers){
      const last = this.cache;
      const cache = [] as Scanner.Node[];
  
      try {
        this.cache = cache;
        match.call(this);
        return true;
      }
      catch(err){
        this.buffer = cache.concat(this.buffer);
      }
      finally {
        this.cache = last;
      }
    }
  }

  look(ignore?: Scanner.Type[] | boolean){
    if(ignore)
      this.skip(ignore);

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

  maybe(type: Scanner.Type, advance?: boolean){
    this.skip();

    const next = this.look();

    if(next.type != type)
      return;
    
    if(advance)
      this.next();

    return next.value;
  }

  assert(type: Scanner.Type | Scanner.Type[], value?: string | string[]){
    const got = this.expect(type, true);

    if(!value || value === got)
      return got;

    if(Array.isArray(value) && value.includes(got))
      return got;

    throw new Error(`Token ${type} has value \`${got}\`, expected \`${value}\``);
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

    const where = "line" in token ? ` at line ${token.line}` : "";

    throw new Error(`Unexpected ${type}` + where);
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
    while(this.next().type !== "semi")
      continue;
  }

  unexpected(){
    const token = this.look();
    const where = "line" in token ? ` at line ${token.line}` : "";
  
    return new Error(`Unexpected ${token.type}` + where);
  }

  inParenthesis(required: true): string[];
  inParenthesis<T>(matchers: (() => T)[]): T[];
  inParenthesis(required?: boolean): string[] | undefined;
  inParenthesis<T = string>(argument?: boolean | (() => T)[]){
    const collection = [] as T[];

    const scan = () => {
      this.expect("lparen");
  
      while(true){
        if(this.maybe("rparen", true))
          break;
  
        let value: T;

        if(typeof argument == "object"){
          const matchers = argument.map(fn => () => value = fn())
          const match = this.try(...matchers);

          if(!match)
            throw this.unexpected();
        }
        else
          value = this.expect([ "number", "string" ]) as T;
  
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