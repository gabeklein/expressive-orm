import moo from "moo";
import { matchers, Symbols } from "./grammar";

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
  buffer?: Scanner.Node[];

  constructor(public code: string){
    this.lexer = moo.compile(matchers).reset(code);
  }

  look(ignore?: Scanner.Type[] | boolean){
    if(ignore)
      this.skip(ignore);

    if(this.lookAhead)
      return this.lookAhead;

    return this.lookAhead = this.next();
  }

  next(){
    const next =
      this.lookAhead ||
      this.lexer.next() ||
      { type: "end", value: undefined };

    this.lookAhead = undefined;
  
    return next as Scanner.Node;
  }

  get<T>(check: (next: Scanner.Node) => T | undefined): T;
  get<T>(checkMultiple: (next: Scanner.Node) => (next: Scanner.Node) => T): T;
  get(check: Function){
    let result = check(this.next());

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

    return this.get((token: Scanner.Node) => {
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
  
      throw new Error(`Unexpected ${type}` + where);
    })
  }

  skip(types?: Scanner.Type[] | true){
    let buffer;

    if(typeof types !== "object")
      types = ["comment", "newline", "space"];

    do { buffer = this.next() }
    while(types.includes(buffer.type));

    this.lookAhead = buffer;
  }

  endStatement(){
    while(this.next().type !== "semi")
      continue;
  }
}

export default Scanner;