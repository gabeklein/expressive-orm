function test(){
  return true;
}

function print(stuff){
  if(typeof stuff === "string")
    return "    " + stuff.replace(/\n/g, "\n    ");
  else
    throw null;
}

function serialize(stuff){
  if(typeof stuff === "string")
    return stuff.replace(/^    /g, "");
  else
    throw null;
}

module.exports = {
  test,
  print,
  serialize
}