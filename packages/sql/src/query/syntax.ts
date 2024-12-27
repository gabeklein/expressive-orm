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

export { Syntax };