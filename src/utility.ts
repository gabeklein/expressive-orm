export function qualify(...args: (string | number | undefined)[]){
  const backtick: any = (text: string) => {
    return String(text).startsWith("`") ? text : '`' + text + '`';
  };

  return args.filter(x => x).map(backtick).join(".");
}

export function escapeString(text: string){
  if(text.startsWith("\"") || text.startsWith("'"))
    return text;

  return `'` + text.replace(/'/g, `\\'`) + `'`;
}

export function decapitalize(string: string){
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

declare namespace asPromise {
  type Action<T> = (
    callback: (err: Error | null | undefined, value?: T) => void
  ) => void;
}

function asPromise<T = void>(action: asPromise.Action<T>){
  return new Promise<T>((res, rej) => {
    action((err, returns) => {
      if(err)
        rej(err);
      else
        res(returns as T);
    })
  })
}

export { asPromise };

// export function promisify(fn){
//   return (...args) => {
//     return new Promise((resolve, reject) => {
//       function customCallback(err, ...results) {
//         if (err) {
//           return reject(err)
//         }
//         return resolve(results.length === 1 ? results[0] : results) 
//        }
//        args.push(customCallback)
//        fn.call(this, ...args)
//      })
//   }
// }