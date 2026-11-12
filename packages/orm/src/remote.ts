import { Connection, NAMED } from './Connection';
import { row } from './Field';
import type { Query } from './query/Query';
import type { Type } from './Type';

declare namespace Remote {
  /** Values by property name. */
  type Values = Record<string, unknown>;

  /** A primary key as it travels - the id, or a composite key's parts by property. */
  type Id = string | number | Values;

  /** A filter or order by property - `[property, op, value?]`. */
  type Constraint = [property: string, op: Op, value?: unknown];

  /** Operators a request may use. */
  type Op = "=" | "<>" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "IN" | "NOT IN" | "IS NULL" | "IS NOT NULL" | "asc" | "desc";

  /** A request as it travels - classes by the key they are bound under, fields by property, never table or column. */
  type Request =
    | { op: "select"; type: string; where: Constraint[]; limit?: number; offset?: number }
    | { op: "insert"; type: string; data: Values; returns?: boolean; conflict?: Conflict }
    | { op: "update"; type: string; id: Id; data: Values }
    | { op: "remove"; type: string; id: Id };

  /** How an insert handles an existing row, by property. The server computes its own `update` values. */
  interface Conflict {
    on: string[];
    update?: string[];
  }

  /** Delivers a request to `Remote.handle` on the other side, resolving its result. */
  type Send = (request: Request) => Promise<any>;

  /** What `Remote.handle` serves, and to whom. */
  interface Options<C = unknown> {
    /**
     * Properties each class shares, by key - read, filtered and written. `id` is always shared.
     *
     * A class left out shares every property. A property not shared is absent from rows and rejected in requests.
     */
    expose?: { [type: string]: readonly string[] };

    /**
     * Runs for each valid request before it does, with the context given to the handler - throw to refuse it.
     *
     * Push onto a select's `where` to narrow the rows it reads.
     */
    check?(request: Request, context: C): void | Promise<void>;
  }
}

const SEND = new WeakMap<Connection, Remote.Send>();
const OPS = new Set(["=", "<>", "!=", "<", "<=", ">", ">=", "LIKE", "IN", "NOT IN", "IS NULL", "IS NOT NULL", "asc", "desc"]);
const BARE = new Set(["IS NULL", "IS NOT NULL", "asc", "desc"]);

type Entity = typeof Type & {
  fetch(from: Type.Constraint[], limit?: number, offset?: number): Promise<Remote.Values[]>;
  prepare(data: Remote.Values, partial?: boolean): Promise<Record<string, unknown>>;
};

/**
 * A connection forwarding every read and write to another, through `send`.
 *
 * Requests name each class by the key it is bound under and each field by its property, so the far side
 * resolves both against its own classes - tables and columns never leave it. Bind classes as an object,
 * the same keys on both sides. Throws when classes come as an array, or two share a table.
 * Statics by id or filter, relations and instance writes travel; `count`, writes by filter, `Query`,
 * transactions and live rows do not.
 *
 * @example
 * const db = Remote.new({ User, Post }, request => api.database(request));
 */
class Remote extends Connection {
  constructor(using: Connection.Types, send: Remote.Send){
    if (Array.isArray(using))
      throw new Error("Remote binds classes by key - pass an object of them.");

    super(using);

    const tables = new Map<string, Query.Table>();

    for (const type of this.using) {
      const { ref } = type as Entity;
      const other = tables.get(ref);

      if (other) {
        for (const type of this.using) {
          delete (type as { connection?: unknown }).connection;
          NAMED.delete(type);
        }

        throw new Error(`${other.name} and ${type.name} share table ${ref} - a Remote can't tell them apart.`);
      }

      tables.set(ref, type);
    }

    SEND.set(this, send);
  }

  /**
   * Serve requests from a `Remote` through `connection` - returns a handler taking each request, and a context for `check`.
   *
   * A request is validated, then run by the class `connection` binds under its key - as its own statics run,
   * so fields check values, subsets scope reads and inserts, fixed fields reject updates and `update` fields take
   * this side's value. Hooks run. A malformed request, unknown class or property not shared rejects.
   * Every class bound by key is served to whoever reaches the handler - authorize in `check`, or before calling it.
   *
   * @example
   * const serve = Remote.handle(db, { expose: { User: ["name"] } });
   * const database = (request: unknown) => serve(request);
   */
  static handle<C = unknown>(connection: Connection, options: Remote.Options<C> = {}){
    return async (input: unknown, context?: C): Promise<unknown> => {
      const request = valid(input);
      const type = [...connection.using].find(type => (
        NAMED.get(type) === request.type && type.connection === connection
      )) as Entity | undefined;

      if (!type)
        throw new Error(`Type ${request.type} is not served by this connection.`);

      const expose = options.expose?.[request.type];
      const shared = (name: string) => {
        const field = type.fields.get(name);

        if (!field || field.absent || expose && name != "id" && !expose.includes(name))
          throw new Error(`${type.name} has no property ${name}.`);

        return field;
      };

      const out = (values: Remote.Values) => Object.fromEntries(Object.entries(values).filter(([name]) => (
        !expose || name == "id" || expose.includes(name)
      )));

      const id = (value: Remote.Id) => {
        const { parts } = type.fields.get("id")!;

        if (!parts) {
          if (typeof value != "string" && typeof value != "number")
            throw new Error(`${type.name} needs an id, not ${JSON.stringify(value)}.`);

          return value;
        }

        if (!value || typeof value != "object" || Object.keys(value).length != parts.length || parts.some(part => !(part.key in value)))
          throw new Error(`${type.name} needs an id of ${parts.map(part => part.key)}.`);

        return parts.map(part => value[part.key]) as unknown as string;
      };

      for (const [name] of request.op == "select" ? request.where : [])
        shared(name);

      for (const name in "data" in request ? request.data : {})
        shared(name);

      if (request.op == "insert" && request.conflict)
        [...request.conflict.on, ...request.conflict.update || []].forEach(shared);

      if ("id" in request)
        request.id = id(request.id);

      await options.check?.(request, context as C);

      switch (request.op) {
        case "select": {
          const where = [...request.where, ...Object.entries(type.subset || {}).map(([key, value]) => [key, "=", value])];
          const rows = await type.fetch(where as Type.Constraint[], request.limit ?? undefined, request.offset ?? undefined);

          return rows.map(out);
        }

        case "insert": {
          const { connection, fields, ref, subset } = type;
          const data = await type.prepare({ ...request.data, ...subset });
          const conflict = request.conflict && await upsert(type, request.conflict);
          const inserted = await connection.insert(ref, data, request.returns, conflict);

          return inserted && out(await row(fields, inserted) as Remote.Values);
        }

        case "update": {
          const data: Remote.Values = {};

          for (const name in request.data)
            if (type.fields.get(name)!.update === undefined)
              data[name] = request.data[name];

          return type.update(request.id as any, data as any);
        }

        case "remove":
          return type.delete(request.id as any);
      }
    };
  }

  async select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number){
    const [type, map] = this._target(table);
    const where = constraints.map(([column, op, value]) => (
      BARE.has(op) ? [map.key(column), op] : [map.key(column), op, value]
    ) as Remote.Constraint);

    const rows: Remote.Values[] = await this._send({ op: "select", type, where, limit, offset });

    return rows.map(map.row);
  }

  async insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict){
    const [type, map] = this._target(table);
    const request: Remote.Request = { op: "insert", type, data: map.values(data), returns };

    if (conflict)
      request.conflict = {
        on: conflict.on.map(map.key),
        update: [...conflict.update || [], ...Object.keys(conflict.set || {})].map(map.key)
      };

    const row = await this._send(request);

    return row && map.row(row);
  }

  async update(table: string, id: Connection.Key, data: Record<string, any>){
    const [type, map] = this._target(table);
    await this._send({ op: "update", type, id: map.id(id), data: map.values(data) });
  }

  async remove(table: string, id: Connection.Key){
    const [type, map] = this._target(table);
    await this._send({ op: "remove", type, id: map.id(id) });
  }

  _send(request: Remote.Request){
    return SEND.get(this)!(request);
  }

  _target(table: string){
    for (const type of this.using)
      if ((type as Entity).ref === table) {
        const key = NAMED.get(type);

        if (key === undefined)
          throw new Error(`Type ${type.name} is not bound by key, so it cannot be sent.`);

        return [key, names(type)] as const;
      }

    throw new Error(`Table ${table} is not used by this connection.`);
  }
}

const NAMES = new WeakMap<Query.Table, ReturnType<typeof map>>();

function names(type: Query.Table){
  let names = NAMES.get(type);

  if (!names)
    NAMES.set(type, names = map(type));

  return names;
}

function map(type: Query.Table){
  const keys = new Map<string, string>();
  const columns = new Set<string>();
  const { parts } = type.fields.get("id")!;

  for (const field of type.fields.values())
    if (!field.absent) {
      keys.set(field.column, field.key);
      columns.add(field.key);
    }

  const key = (column: string) => {
    const name = keys.get(column);

    if (name === undefined)
      throw new Error(`${type.name} has no column ${column}.`);

    return name;
  };

  return {
    key,
    id: (id: Connection.Key): Remote.Id => (
      parts ? Object.fromEntries(parts.map((part, i) => [part.key, (id as unknown[])[i]])) : id as string | number
    ),
    values(data: Record<string, unknown>){
      const out: Remote.Values = {};

      for (const column in data)
        out[key(column)] = data[column];

      return out;
    },
    row(values: Remote.Values){
      const out: Record<string, unknown> = {};

      for (const name in values)
        if (columns.has(name))
          out[type.fields.get(name)!.column] = values[name];

      return out;
    }
  };
}

async function upsert(type: Entity, conflict: Remote.Conflict): Promise<Connection.Conflict> {
  const column = (name: string) => type.fields.get(name)!.column;
  const on = conflict.on.map(column);
  const own = await type.prepare({}, true);
  const update: string[] = [];
  const set: Record<string, unknown> = {};

  for (const name of conflict.update || []) {
    const field = type.fields.get(name)!;

    if (field.fixed || field.primary || on.includes(field.column))
      continue;

    if (field.column in own)
      set[field.column] = own[field.column];
    else
      update.push(field.column);
  }

  return update.length || Object.keys(set).length ? { on, update, set } : { on };
}

function valid(input: unknown): Remote.Request {
  const fail = (): never => {
    throw new Error("Malformed request.");
  };

  const object = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value == "object" && !Array.isArray(value)
  );

  const names = (value: unknown) => Array.isArray(value) && value.every(item => typeof item == "string");
  const count = (value: unknown) => value == null || Number.isSafeInteger(value) && (value as number) >= 0;

  if (!object(input) || typeof input.type != "string")
    return fail();

  const request = { ...input } as Remote.Request;

  switch (request.op) {
    case "select":
      if (!Array.isArray(request.where) || !count(request.limit) || !count(request.offset))
        return fail();

      request.where = request.where.map(item => {
        if (!Array.isArray(item) || typeof item[0] != "string" || !OPS.has(item[1]))
          return fail();

        const [name, op, value] = item;

        if (BARE.has(op))
          return [name, op];

        if ((op == "IN" || op == "NOT IN") != Array.isArray(value))
          return fail();

        return [name, op, value];
      });

      return request;

    case "insert":
      if (!object(request.data) || request.returns !== undefined && typeof request.returns != "boolean")
        return fail();

      if (request.conflict !== undefined && (
        !object(request.conflict) || !names(request.conflict.on) || request.conflict.update !== undefined && !names(request.conflict.update)
      ))
        return fail();

      return request;

    case "update":
      return object(request.data) ? request : fail();

    case "remove":
      return request;

    default:
      return fail();
  }
}

export { Remote };
