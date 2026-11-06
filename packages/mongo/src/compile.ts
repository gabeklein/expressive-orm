import { Builder, Computed, DataField, DataTable, Field, now, Parameter, QueryTemplate } from '@expressive/orm';
import type { Document } from 'mongodb';

import { operator, path } from './filter';

type Row = Record<string, any>;
type Bind = (param: Parameter) => unknown;
type Cond = { left: Field; op: string; right: unknown };
type Group = { children: Set<Cond | Group> };
type Locate = (field: Field) => string;

type Plan =
  | { kind: "read"; from: string; pipeline: (bind: Bind) => Document[]; read: (doc: Document) => Row }
  | { kind: "count"; from: string; pipeline: (bind: Bind) => Document[] }
  | { kind: "update"; from: string; filter: (bind: Bind) => Document; set: (bind: Bind) => Document }
  | { kind: "delete"; from: string; filter: (bind: Bind) => Document };

const BAIL = Symbol("bail");

function bail(): never {
  throw BAIL;
}

function key(table: Builder.ITable) {
  return table.type!.fields.get("id")!;
}

function opaque(input: unknown) {
  return input instanceof Field || input instanceof Computed || input instanceof DataField || input instanceof QueryTemplate;
}

function encode(field: Field, op: string, input: unknown, bind: Bind) {
  if (input instanceof Parameter)
    return bind(input);

  if (input === now)
    return field.set(new Date());

  if (input == null || op.includes("LIKE"))
    return input;

  return field.set(input);
}

function condition(cond: Cond, locate: Locate) {
  const { left, op, right } = cond;
  const column = locate(left);

  if ([right].flat().some(opaque))
    bail();

  return (bind: Bind) => ({
    [column]: operator(op, Array.isArray(right)
      ? right.map(input => encode(left, op, input, bind))
      : encode(left, op, right, bind))
  });
}

function expression(item: Cond | Group, locate: Locate, or: boolean): (bind: Bind) => Document {
  if (!("children" in item))
    return condition(item, locate);

  const children = Array.from(item.children, child => expression(child, locate, !or));

  return bind => {
    const parts = children.map(child => child(bind));

    if (!parts.length)
      return or ? { $expr: false } : {};

    return parts.length == 1 ? parts[0] : { [or ? "$or" : "$and"]: parts };
  };
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  }
  catch (error) {
    if (error === BAIL)
      return;

    throw error;
  }
}

function compile(builder: Builder): Plan | undefined {
  return attempt(() => plan(builder));
}

function plan(builder: Builder): Plan {
  const { tables, inserts, updates, deletes, filters, order, limit, offset, returns, templates, conflict } = builder;
  const sources = Array.from(tables.values());

  if (templates.size || inserts.size || conflict || sources.some(table => table instanceof DataTable || !table.type))
    bail();

  const [root, ...joined] = sources;
  const prefix = new Map<Builder.ITable, string>([[root, ""]]);
  const pending = new Set(sources.flatMap(table => table.joins as Cond[]));
  const lookups: ((bind: Bind) => Document[])[] = [];
  const scoped = new Map<Builder.ITable, Cond[]>();
  const rest = new Set<Cond | Group>();

  for (const child of filters.children as Set<Cond | Group>) {
    const table = !("children" in child) && child.left.table;

    if (table && sources.includes(table) && !table.optional && !updates.size && !deletes.size)
      scoped.set(table, [...scoped.get(table) || [], child as Cond]);
    else
      rest.add(child);
  }

  const narrow = (table: Builder.ITable) => {
    const conds = (scoped.get(table) || []).map(cond => condition(cond, field => path(key(table), field.column)));

    return (bind: Bind) => conds.length ? conds.length == 1 ? conds[0](bind) : { $and: conds.map(cond => cond(bind)) } : undefined;
  };

  const first = narrow(root);

  const locate: Locate = field => {
    const table = field.table!;
    const at = prefix.get(table);

    if (at === undefined)
      bail();

    return at + path(key(table), field.column);
  };

  joined.forEach((table, i) => {
    const as = `__${i + 1}`;
    const ready = Array.from(pending).filter(({ left, right }) => (
      prefix.has(left.table!) && (right as Field).table === table ||
      prefix.has((right as Field).table!) && left.table === table
    ));

    if (ready.length != 1 || ready[0].op != "=")
      bail();

    const [cond] = ready;
    const [local, foreign] = cond.left.table === table
      ? [cond.right as Field, cond.left]
      : [cond.left, cond.right as Field];

    const lookup = { from: table.name, localField: locate(local), foreignField: path(key(table), foreign.column), as };
    const inner = narrow(table);

    pending.delete(cond);
    lookups.push(bind => {
      const match = inner(bind);

      return [
        { $lookup: match ? { ...lookup, pipeline: [{ $match: match }] } : lookup },
        { $unwind: { path: "$" + as, preserveNullAndEmptyArrays: !!table.optional } }
      ];
    });

    prefix.set(table, as + ".");
  });

  if (pending.size)
    bail();

  const where = expression({ children: rest }, locate, false);

  if (updates.size || deletes.size) {
    const from = root.name;

    if (joined.length || returns || order.size || limit || offset || updates.size + deletes.size > 1)
      bail();

    if (deletes.size)
      return { kind: "delete", from, filter: where };

    const [[target, data]] = updates;
    const primary = key(target);
    const assign = Array.from(data, ([field, input]) => {
      if (opaque(input) || !primary.parts && field.column == primary.column)
        bail();

      return [field, input] as const;
    });

    return {
      kind: "update",
      from,
      filter: where,
      set: bind => Object.fromEntries(assign.map(([field, input]) => [
        field.column,
        input instanceof Parameter ? bind(input) : input === now ? field.set(new Date()) : input
      ]))
    };
  }

  const sort: Record<string, 1 | -1> = {};

  order.forEach((dir, field) => {
    sort[locate(field)] = dir == "asc" ? 1 : -1;
  });

  const pipeline = (bind: Bind, tail: Document[]) => {
    const early = first(bind);
    const stages: Document[] = early ? [{ $match: early }] : [];
    const match = where(bind);

    lookups.forEach(lookup => stages.push(...lookup(bind)));

    if (Object.keys(match).length)
      stages.push({ $match: match });

    if (order.size)
      stages.push({ $sort: "_id" in sort ? sort : { ...sort, _id: 1 } });

    if (offset)
      stages.push({ $skip: offset });

    if (limit)
      stages.push({ $limit: limit });

    return [...stages, ...tail];
  };

  if (!returns)
    return { kind: "count", from: root.name, pipeline: bind => pipeline(bind, [{ $count: "count" }]) };

  const selects = returns instanceof Map ? Array.from(returns) : [["value", returns] as const];
  const reads = selects.map(([name, select]) => {
    if (!(select instanceof Field))
      bail();

    const column = locate(select);
    const [as, inner] = column.includes(".") ? column.split(".") : [undefined, column];

    return [name, column, (doc: Document) => as ? doc[as]?.[inner] : doc[inner]] as const;
  });

  const project: Document = Object.fromEntries(reads.map(([, column]) => [column, 1]));

  if (!("_id" in project))
    project._id = 0;

  return {
    kind: "read",
    from: root.name,
    pipeline: bind => pipeline(bind, [{ $project: project }]),
    read: doc => Object.fromEntries(reads.map(([name, , get]) => [name, get(doc)]))
  };
}

function prefilter(builder: Builder, table: Builder.ITable): (bind: Bind) => Document {
  const parts: ((bind: Bind) => Document)[] = [];

  if (!table.optional && table.type)
    for (const child of builder.filters.children as Set<Cond | Group>)
      if (!("children" in child) && child.left.table === table) {
        const part = attempt(() => condition(child, field => path(key(table), field.column)));

        if (part)
          parts.push(part);
      }

  return bind => parts.length ? { $and: parts.map(part => part(bind)) } : {};
}

export { compile, prefilter };
export type { Bind, Plan };
