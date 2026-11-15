import type { Field, Type } from '@expressive/orm';
import type { Document } from 'mongodb';

type Row = Record<string, any>;

const COMPARE: Record<string, (value: any) => Document> = {
  '=': value => ({ $eq: value }),
  '!=': value => ({ $nin: [value, null] }),
  '<>': value => ({ $nin: [value, null] }),
  '>': value => ({ $gt: value }),
  '<': value => ({ $lt: value }),
  '>=': value => ({ $gte: value }),
  '<=': value => ({ $lte: value }),
  'IN': (values: unknown[]) => ({ $in: values.filter(value => value != null) }),
  'NOT IN': (values: unknown[]) => ({ $nin: [...values, null] }),
  'LIKE': (pattern: string) => ({ $regex: like(pattern), $options: "s" })
};

function like(pattern: string) {
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');

  return `^${source}$`;
}

function operator(op: string, value: unknown): Document {
  if (op == "IS NULL" || value == null && op == "=")
    return { $eq: null };

  if (op == "IS NOT NULL" || value == null && (op == "<>" || op == "!="))
    return { $ne: null };

  if (value == null && COMPARE[op])
    return { $in: [] };

  const compare = COMPARE[op];

  if (!compare)
    throw new Error(`Unsupported operator: ${op}`);

  return compare(value);
}

function path(key: Field, column: string) {
  return !key.parts && column == key.column ? "_id" : column;
}

function locate(key: Field, id: unknown): Document {
  return key.parts
    ? Object.fromEntries(key.parts.map((part, i) => [part.column, (id as unknown[])[i]]))
    : { _id: id };
}

function identify(key: Field, row: Row) {
  return key.parts ? Object.freeze(key.parts.map(part => row[part.column])) : row[key.column];
}

function toDoc(key: Field, row: Row): Document {
  if (key.parts)
    return { ...row };

  const { [key.column]: id, ...rest } = row;

  return id === undefined ? rest : { _id: id, ...rest };
}

function toRow(key: Field, doc: Document): Row {
  const { _id, ...rest } = doc;

  return key.parts ? rest : { [key.column]: _id, ...rest };
}

function constrain(key: Field, constraints: Type.Constraint[]) {
  const and: Document[] = [];
  const sort: Record<string, 1 | -1> = {};

  for (const [column, op, value] of constraints)
    if (op == "asc" || op == "desc")
      sort[path(key, column)] = op == "asc" ? 1 : -1;
    else
      and.push({ [path(key, column)]: operator(op, value) });

  return {
    filter: and.length ? { $and: and } : {},
    sort
  };
}

export { constrain, identify, locate, operator, path, toDoc, toRow };
