import es from "estree";
import t, { node } from "./node";

export interface BunchOf<T> { [key: string]: T };
export type FlatValue = string | number | boolean | null;

const IdentifierType = /(Expression|Literal|Identifier|JSXElement|JSXFragment|Import|Super|MetaProperty|TSTypeAssertion)$/;

export function isExpression(node: any): node is es.Expression {
  return typeof node == "object" && IdentifierType.test(node.type);
}

export function expression(value?: FlatValue | es.Expression){
  try {
    return literal(value as any);
  }
  catch(err){
    return value as es.Expression;
  }
}

export function literal(value: string | number | boolean): es.Literal;
export function literal(value: null): es.Literal;
export function literal(value: undefined): es.Identifier;
export function literal(value: string | number | boolean | null | undefined){
  switch(typeof value){
    case "string":
    case "number":
    case "boolean":
      return t.Literal({ value });
    case "undefined":
      return identifier("undefined");
    case "object":
      if(value === null)
        return t.Literal({ value });
    default:
      throw new Error("Not a literal type");
  }
}

export function identifier(name: string): es.Identifier {
  return t.Identifier({ name });
}

export function keyIdentifier(name: string){
  return /^[A-Za-z0-9$_]+$/.test(name)
    ? identifier(name)
    : literal(name);
}

export function property(
  key: string | es.Literal | es.Identifier,
  value: es.Expression){

  let shorthand = false;

  if(typeof key == "string"){
    shorthand =
      value.type == "Identifier" &&
      value.name == key;

    key = keyIdentifier(key);
  }

  return t.Property({ 
    key,
    value,
    shorthand,
    computed: false,
    kind: "init",
    method: false
  });
}

export function spread(argument: es.Expression){
  return t.SpreadElement({ argument });
}

export function pattern(
  properties: (es.RestElement | es.AssignmentProperty)[]){

  return t.ObjectPattern({ properties });
}

declare namespace object {
  type Map = BunchOf<es.Expression | string | number | false | undefined>;
  type Properties = (es.Property | es.SpreadElement)[];
}

export function object(
  obj: object.Properties | object.Map,
  undefinedEmpty: true
): es.ObjectExpression | undefined;

export function object(
  obj: object.Properties | object.Map,
  undefinedEmpty?: boolean
): es.ObjectExpression;

export function object(
  obj: object.Properties | object.Map = {},
  undefinedEmpty?: boolean){

  let properties = [];

  if(Array.isArray(obj))
    properties = obj;
  else {
    const entries = Object.entries(obj);

    if(!entries.length && undefinedEmpty)
      return undefined;

    for(let [key, value] of entries)
      if(value){
        if(typeof value !== "object")
          value = literal(value);
        
        properties.push(property(key, value))
      }
  }

  return t.ObjectExpression({ properties });
}

export function get(object: "this"): es.ThisExpression;
export function get<T extends es.Expression> (object: T): T;
export function get(object: string | es.Expression, ...path: (string | number | es.Expression)[]): es.MemberExpression;
export function get(object: string | es.Expression, ...path: (string | number | es.Expression)[]){
  if(object == "this")
    object = t.ThisExpression();

  if(typeof object == "string")
    path = [...object.split("."), ...path]

  for(const x of path){
    let select;

    if(isExpression(x))
      select = x;    
    else if(typeof x == "number")
      select = literal(x);
    else if(typeof x == "string")
      select = keyIdentifier(x);
    else
      throw new Error("Bad member id, only strings and numbers are allowed");

    object = typeof object == "object"
      ? member(object, select)
      : select;
  }

  return object as es.Expression;
}

export function member(object: es.Expression, property: es.Expression){
  return t.MemberExpression({
    object,
    property,
    optional: false,
    computed: property.type !== "Identifier"
  })
}

export function call(
  callee: es.Expression | string, ...args: (es.Expression | undefined)[]){

  args = args.filter(x => x !== undefined);

  if(typeof callee == "string")
    callee = get(callee);

  return t.CallExpression({
    callee,
    arguments: args as es.Expression[],
    optional: false
  })
}

export function returns(argument: es.Expression){
  return t.ReturnStatement({ argument });
}

export function declare(
  kind: "const" | "let" | "var",
  id: es.Pattern,
  init?: es.Expression ){

  return t.VariableDeclaration({
    kind,
    declarations: [
      t.VariableDeclarator({
        id,
        init: init || null
      })
    ]
  })
}

export function objectAssign(...objects: es.Expression[]){
  return call("Object.assign", ...objects)
}

export function objectKeys(object: es.Expression){
  return call("Object.keys", object)
}

export function template(text: string){
  return t.TemplateLiteral({
    expressions: [],
    quasis: [
      t.TemplateElement({
        value: { raw: text, cooked: text },
        tail: false
      })
    ]
  })
}

export function statement(from: es.Statement | es.Expression){
  return isExpression(from)
    ? t.ExpressionStatement({ expression: from })
    : from;
}

export function block(
  ...statements: (es.Statement | es.Expression)[]): es.BlockStatement {

  return t.BlockStatement({
    body: statements.map(statement)
  });
}

export function arrow(
  params: (es.Identifier | es.Pattern | es.RestElement)[],
  body: es.BlockStatement | es.Expression,
  async = false){

  return t.ArrowFunctionExpression({
    async,
    body,
    generator: false,
    params,
    expression: isExpression(body)
  });
}

type ClassBody = (es.MethodDefinition | es.PropertyDefinition | es.StaticBlock)[];

export function classDeclaration(name: string, body: ClassBody): es.ClassDeclaration;
export function classDeclaration(name: string, extend: string | es.Expression, body: ClassBody): es.ClassDeclaration;
export function classDeclaration(a1: string, a2: string | es.Expression | ClassBody | undefined, a3?: ClassBody){
  if(Array.isArray(a2)){
    a3 = a2;
    a2 = undefined;
  }

  return t.ClassDeclaration({
    id: identifier(a1),
    superClass: typeof a2 == "string" ? identifier(a2) : a2,
    body: t.ClassBody({
      body: a3 || []
    }),
  })
}

export function classProperty(
  name: string,
  value: es.Expression){

  return t.PropertyDefinition({
    key: identifier(name),
    value
  })
}

export function importDeclaration(
  source: es.Literal | string,
  specifiers: Array<es.ImportSpecifier | es.ImportDefaultSpecifier | es.ImportNamespaceSpecifier>
){
  if(typeof source == "string")
    source = literal(source);

  return t.ImportDeclaration({ specifiers, source })
}

export function importSpecifier(
  local: es.Identifier | string,
  imported?: es.Identifier | string){

  if(typeof local == "string")
    local = identifier(local);

  if(imported == "default")
    return node("ImportDefaultSpecifier", { local })

  if(typeof imported == "string")
    imported = identifier(imported);

  return node("ImportSpecifier", {
    local,
    imported: imported || local
  })
}