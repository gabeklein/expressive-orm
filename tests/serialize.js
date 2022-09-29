const { format } = require('sql-formatter');

function test(){
  return true;
}

function print(stuff){
  if(typeof stuff !== "string")
    stuff = String(stuff);
  
  return "    " + stuff.replace(/\n/g, "\n    ");
}

function serialize(stuff){
  if(typeof stuff !== "string")
    stuff = String(stuff);
  
  return format(stuff);
}

module.exports = {
  test,
  print,
  serialize
}