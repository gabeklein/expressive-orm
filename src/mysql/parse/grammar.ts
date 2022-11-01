export type Symbols = 
  | "space"
  | "comment"
  | "number"
  | "string"
  | "quote"
  | "escaped"
  | "semi"
  | "lparen"
  | "rparen"
  | "comma"
  | "word"
  | "newline"
  | "end";

function trim(raw: string){
  return raw.slice(1, -1);
}

export const matchers: moo.Rules = {
  space: /[ \t]+/,
  comment: { match: /--[\S\s]*?\n|\/\*[\W\w]+?\*\//, lineBreaks: true },
  number:  { match: /0|[1-9][0-9]*/, value: x => Number(x) as any },
  string: { match: /"(?:\\"|[^\r\n])*?"/, value: trim },
  quote: { match: /'(?:\\'|[^\r\n])*?'/, value: trim },
  escaped: { match: /`(?:\\`|[^\r\n])*?`/, value: trim },
  semi: ';',
  lparen: '(',
  rparen: ')',
  comma: ',',
  word: /(?:NOT )?\w+/,
  newline: { match: /\n+/, lineBreaks: true },
};