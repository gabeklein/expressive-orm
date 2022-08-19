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