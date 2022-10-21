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

export const matchers: moo.Rules = {
  space: /[ \t]+/,
  comment: { match: /--[^\r\n]*\r?\n|\/\*[\W\w]+?\*\//, lineBreaks: true },
  number:  { match: /0|[1-9][0-9]*/, value: x => Number(x) as any },
  string: { match: /"(?:\\"|[^\r\n])*?"/, value: x => x.slice(1, -1) },
  quote: { match: /'(?:\\'|[^\r\n])*?'/, value: x => x.slice(1, -1) },
  escaped: { match: /`(?:\\`|[^\r\n])*?`/, value: x => x.slice(1, -1) },
  semi: ';',
  lparen: '(',
  rparen: ')',
  comma: ',',
  word: /(?:NOT )?\w+/,
  newline: { match: /\n+/, lineBreaks: true },
};