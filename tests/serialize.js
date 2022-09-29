const { format } = require('sql-formatter');

function test(){
  return true;
}

function print(stuff){
  if(typeof stuff !== "string")
    return String(stuff);
  
  return stuff;
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