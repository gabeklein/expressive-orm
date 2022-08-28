import { GENERATOR } from 'astring';

import type t from "estree";

export type Type = t.Node["type"];

export type NodeType<T extends Type, N = t.Node> = N extends { type: T } ? N : never;

type NodeTypes = {
  [T in Type]: (fields?: Fields<NodeType<T>>) => NodeType<T>;
}

type Only<T, U> = { [P in keyof T]: T[P] extends U ? P : never }[keyof T];
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

export type Fields<T extends t.Node> = 
  & Pick<T, Exclude<keyof T, "type" | Only<T, boolean>>>
  & Partial<Pick<T, Only<T, boolean>>>

export function node<T extends Type>(
  type: T, fields?: Fields<NodeType<T>>){

  return { ...fields, type } as NodeType<T>;
}
  
const types = {} as NodeTypes;

for(const type of Object.keys(GENERATOR) as Type[])
  types[type] = (input: any) => ({ ...input, type })

export default types;
