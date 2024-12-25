class Syntax extends Array<any> {
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
  return new Syntax(...strings);
}

class Template extends Syntax {
  constructor(strings: TemplateStringsArray, values: any[]){
    super();
  
    for (let i = 0; i < strings.length; i++) {
      this.push(strings[i]);
  
      if (i < values.length)
        this.push(values[i]);
    }    
  }
}

export { sql, Syntax, Template };