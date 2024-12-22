class Syntax extends Array<any> {
  constructor(strings: any[]);
  constructor(strings: TemplateStringsArray, values: any[]);
  constructor(strings: any, values?: any[]){
    super();

    if(!values){
      this.push(...Array.from(strings));
      return;
    }

    const length = strings.length;
  
    for (let i = 0; i < length; i++) {
      this.push(strings[i]);
  
      if (i < values.length)
        this.push(values[i]);
    }
  }

  toString(){
    return this.map((item, i) => i % 2 ? item : this.stringify(item)).join(" ");
  }

  stringify(value: unknown){
    if(typeof value == "string")
      return `'${value.replace(/'/g, `\\'`)}'`;

    return String(value);
  }
}

function sql(...strings: any[]){
  return new Syntax(strings);
}

export { sql, Syntax };