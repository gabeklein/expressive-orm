export function qualify(...args: (string | undefined)[]){
  const backtick: any = (text: string) => {
    return text.startsWith("`") ? text : '`' + text + '`';
  };

  return args.filter(x => x).map(backtick).join(".");
}

export function escapeString(text: string){
  if(text.startsWith("\"") || text.startsWith("'"))
    return text;

  return `'` + text.replace(/'/g, `\\'`) + `'`;
}

export function lowercase(string: string){
  return string[0].toLowerCase() + string.slice(1)
}

export function sql(
  strings: TemplateStringsArray,
  ...expressions: unknown[]){

  let result = strings[0];

  for(let i = 1, l = strings.length; i < l; i++)
    result +=
      (expressions[i - 1] || "") +
      strings[i].replace(/\s+/g, " ")

  return result.trim();
}