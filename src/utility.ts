export function escape(...args: string[]){
  const backtick = (text: string) => {
    return text.startsWith("`") ? text : '`' + text + '`';
  };

  return args.map(backtick).join(".");
}

export function escapeString(text: string){
  if(text.startsWith("\"") || text.startsWith("'"))
    return text;

  return `'` + text.replace(/'/g, `\\'`) + `'`;
}