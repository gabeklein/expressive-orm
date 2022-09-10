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
  
  return stuff.replace(/^    /g, "");
}

module.exports = {
  test,
  print,
  serialize
}