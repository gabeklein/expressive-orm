import moo from "moo";
import { matchers, Symbols } from "./grammar";

declare namespace Scanner {
  type Type = Symbols;

  type Token<T extends Type = Type> = moo.Token & { type: T };

  type Next = Token | { type: "end" };

  type Matcher<R = any> = {
    [P in Type]?: (token: Token) => R;
  }
}

class Scanner {
  lexer: moo.Lexer;
  buffer?: Scanner.Next;

  constructor(public code: string){
    this.lexer = moo.compile(matchers).reset(code);
  }

  look(ignore?: Scanner.Type[] | boolean){
    if(ignore)
      this.skip(ignore);

    if(this.buffer)
      return this.buffer;

    return this.buffer = this.next();
  }

  next(): Scanner.Next;
  next<T>(check: (next: Scanner.Next) => T | undefined): T;
  next<T>(checkMultiple: (next: Scanner.Next) => (next: Scanner.Next) => T): T;
  next(check?: Function){
    const next = this.buffer || this.lexer.next() || { type: "EOF" };

    this.buffer = undefined;
  
    if(!check)
      return next;

    let result = check(next);

    if(typeof result == "function"){
      check = result as Function;
      result = undefined;
    }

    while(!result){
      const next = this.lexer.next();
      result = check(next || { type: "end" });

      if(!result && !next)
        return;
    }

    return result;
  }

  nextIs<T extends Scanner.Type>(
    type: T, flush?: boolean
  ){
    this.skip();

    const next = this.look();

    if(next.type == type){
      if(flush)
        this.next();

      return next as Scanner.Token<T>;
    }
  }

  expect<T extends Scanner.Type>(expect: T | T[], ignoreWhitespace: boolean): Scanner.Token<T>;
  expect<T extends Scanner.Type>(expect: T | T[], ignore?: Scanner.Type[]): Scanner.Token<T>;
  expect<R>(match: Scanner.Matcher<R>): R;
  expect(
    filter?: Scanner.Type | Scanner.Type[] | Scanner.Matcher,
    ignore?: Scanner.Type[] | boolean){

    if(ignore !== false)
      this.skip(ignore);

    return this.next((token: Scanner.Next) => {
      const type = token.type as Scanner.Type;

      if(Array.isArray(filter)){
        if(filter.includes(type))
          return token;
      }
      else if(typeof filter == "object"){
        const handle = filter[type]

        if(handle)
          return handle(token as any);
      }
      else if(type == filter)
        return token;

      const where = "line" in token ? ` at line ${token.line}` : "";
  
      throw new Error(`Unexpected ` + type + where);
    })
  }

  skip(types?: Scanner.Type[] | true){
    let buffer;

    if(typeof types !== "object")
      types = ["comment", "newline", "space"];

    do { buffer = this.next() }
    while(types.includes(buffer.type));

    this.buffer = buffer;
  }

  endStatement(){
    while(this.next().type !== "semi")
      continue;
  }
}

export default Scanner;