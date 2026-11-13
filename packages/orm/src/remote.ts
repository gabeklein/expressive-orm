import { Connection, NAMED } from './Connection';
import type { Query } from './query/Query';
import { type Field, present } from './Field';
import { RECENT } from './fields';
import { now } from './query/Value';
import { select, type Type } from './Type';

declare namespace Remote {
  /** Values by property name. */
  type Values = Record<string, unknown>;

  /** A primary key as it travels - the id, or a composite key's parts by property. */
  type Id = string | number | Values;

  /** A filter or order by property - `[property, op, value?]`. */
  type Constraint = [property: string, op: Op, value?: unknown];

  /** Operators a request may use. */
  type Op = "=" | "<>" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "IN" | "NOT IN" | "IS NULL" | "IS NOT NULL" | "asc" | "desc";

  /**
   * A request as it travels - classes by the key they are bound under, fields by property, never table or column.
   *
   * `v` is the format's version, `1`; a server refuses any other with code `version`.
   */
  type Request =
    | { v: 1; op: "select"; type: string; where: Constraint[]; limit?: number; offset?: number }
    | { v: 1; op: "insert"; type: string; data: Values; returns?: boolean; conflict?: Conflict }
    | { v: 1; op: "update"; type: string; id: Id; data: Values }
    | { v: 1; op: "remove"; type: string; id: Id };

  /**
   * Why `Remote.handle` refused a request.
   *
   * - `version` - a request format this side doesn't speak.
   * - `malformed` - a request not of the documented shape.
   * - `unknown` - a class not served, or a property not shared.
   * - `invalid` - a value its field refuses, or a write the class forbids.
   * - `failed` - a failure past validation - a constraint, a hook, the database. The original is its `cause`.
   */
  type Code = "version" | "malformed" | "unknown" | "invalid" | "failed";

  /** A refusal from `Remote.handle`, with its `code`. */
  type Error = RemoteError;

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
     * Classes served and the properties each shares, by key - read, filtered and written. `id` and key parts are always shared.
     *
     * Given, a class it leaves out is not served. A property not shared is absent from rows and rejected in requests.
     * A key the connection does not serve throws.
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

/** A refusal from `Remote.handle` - `code` says why; a `failed` one keeps the original as `cause`. */
class RemoteError extends Error {
  cause?: unknown;

  constructor(public code: Remote.Code, message: string, cause?: unknown){
    super(message);
    this.name = "RemoteError";

    if (cause !== undefined)
      this.cause = cause;
  }
}
const OPS = new Set(["=", "<>", "!=", "<", "<=", ">", ">=", "LIKE", "IN", "NOT IN", "IS NULL", "IS NOT NULL", "asc", "desc"]);
const BARE = new Set(["IS NULL", "IS NOT NULL", "asc", "desc"]);

type Entity = typeof Type & {
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
  /** The error `Remote.handle` refuses a request with. */
  static Error = RemoteError;

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
   * A request is validated, then run by the class `connection` binds under its key, as its own statics run:
   * fields check values, subsets scope every read and write, fixed fields reject updates, and fields defaulting
   * to `now` take this side's clock. Hooks run. A refusal is a `Remote.Error` whose `code` says why - see
   * `Remote.Code`; a failure past validation is `Request failed.` with the original as `cause`, so storage
   * details stay here. Errors thrown by `check` pass through as they are. With `expose`, only the classes it names are served.
   *
   * @example
   * const serve = Remote.handle(db, { expose: { User: ["name"] } });
   * const database = (request: unknown) => serve(request);
   */
  static handle<C = unknown>(connection: Connection.Ready, options: Remote.Options<C> = {}){
    const { expose, check } = options;

    for (const key in expose)
      if (!served(connection, key))
        throw new Error(`Type ${key} in expose is not served by this connection.`);

    return async (input: unknown, ...[context]: unknown extends C ? [context?: C] : [context: C]): Promise<unknown> => {
      const request = valid(input);
      const type = served(connection, request.type);

      if (!type || expose && !(request.type in expose))
        throw new RemoteError("unknown", `Type ${request.type} is not served by this connection.`);

      const shared = expose?.[request.type];
      const primary = type.fields.get("id")!;
      const parts = primary.parts || [];
      const visible = (field: Field) => !shared || field === primary || parts.includes(field) || shared.includes(field.key);
      const filled = (field: Field) => field.fallback !== undefined || field.update !== undefined;

      const field = (name: string) => {
        const field = type.fields.get(name);

        if (!field || field.absent || !visible(field))
          throw new RemoteError("unknown", `${type.name} has no property ${name}.`);

        return field;
      };

      const scalar = (field: Field, value: unknown) => {
        const ok = value === null || typeof value == "string" || typeof value == "number" || (
          !("entity" in field) && (typeof value == "boolean" || value instanceof Date || field.type == "json")
        );

        if (!ok)
          throw new RemoteError("malformed", `${type.name}.${field.key} can't take ${show(value)}.`);
      };

      const hidden = (name: string) => {
        const field = type.fields.get(name);
        return !!field && !field.absent && !visible(field) && filled(field);
      };

      const out = (raw: Record<string, unknown>) => {
        const values: Remote.Values = {};

        for (const field of type.fields.values())
          if (!field.absent && field.column in raw && visible(field))
            values[field.key] = raw[field.column];

        return values;
      };

      if (request.op == "select")
        for (const [name, op, value] of request.where) {
          const recent = type.fields.get(name);

          if ((op == "asc" || op == "desc") && recent && RECENT in recent)
            continue;

          const target = field(name);

          if (!BARE.has(op))
            for (const item of Array.isArray(value) ? value : [value])
              scalar(target, item);
        }

      if ("data" in request) {
        const data: Remote.Values = {};

        for (const name in request.data) {
          if (hidden(name))
            continue;

          const target = field(name);

          if (request.op == "update" && (target === primary || parts.includes(target)))
            throw new RemoteError("invalid", `${type.name}.${name} is part of its key and can't be updated.`);

          scalar(target, data[name] = request.data[name]);
        }

        request.data = data;
      }

      if (request.op == "insert" && request.conflict) {
        const { on, update } = request.conflict;

        on.forEach(field);
        request.conflict = { on, update: update && update.filter(name => !hidden(name)) };
        request.conflict.update?.forEach(field);
      }

      const key = "id" in request ? locate(type, request.id) : undefined;

      if (parts.length && "id" in request)
        for (const part of parts)
          scalar(part, (request.id as Remote.Values)[part.key]);

      const subset = Object.entries(type.subset || {}).map(([key, value]) => [key, "=", value] as Type.Constraint);

      if (request.op == "update")
        for (const [name] of subset)
          if (name in request.data)
            throw new RemoteError("invalid", `${type.name}.${name} is fixed by its subset.`);

      await check?.(request, context as C);

      const invalid = async <T>(run: () => T | Promise<T>) => {
        try {
          return await run();
        }
        catch (error) {
          throw new RemoteError("invalid", (error as Error).message);
        }
      };

      if (request.op == "select")
        for (const [name, op, value] of request.where) {
          const target = type.fields.get(name);

          if (!target || target.absent)
            throw new RemoteError("failed", "Request failed.", new Error(`check added a condition on ${type.name}.${name}, which it does not have.`));

          if (!BARE.has(op) && op != "LIKE")
            for (const item of Array.isArray(value) ? value : [value])
              await invalid(() => target.set(present(item), true));
        }

      const own = (data: Remote.Values, insert?: boolean) => {
        const values: Remote.Values = {};

        for (const name in data) {
          const { update, fallback } = type.fields.get(name)!;

          if (insert ? fallback !== now && update !== now : update === undefined)
            values[name] = data[name];
        }

        return values;
      };

      const prepared = request.op == "insert"
        ? await invalid(() => type.prepare({ ...own(request.data, true), ...type.subset }))
        : undefined;

      if (request.op == "update")
        for (const [name, value] of Object.entries(own(request.data))) {
          const target = type.fields.get(name)!;

          if (target.fixed)
            throw new RemoteError("invalid", `${name} is fixed and can't be updated.`);

          await invalid(() => target.set(value));
        }

      try {
        switch (request.op) {
          case "select": {
            const rows = await select(type, [...request.where, ...subset] as Type.Constraint[], request.limit ?? undefined, request.offset ?? undefined);
            return rows.map(out);
          }

          case "insert": {
            const { conflict, data } = request;

            if (conflict && subset.length) {
              const match = conflict.on.map(name => [name, "=", data[name]] as Type.Constraint);

              if (match.every(([, , value]) => value != null) && (await select(type, match, 1)).length && !(await select(type, [...match, ...subset], 1)).length)
                throw new RemoteError("invalid", `${type.name} can't take a row outside its subset.`);
            }

            const inserted = await type.connection.insert(type.ref, prepared!, request.returns, conflict && await upsert(type, conflict));

            return request.returns && inserted ? out(inserted) : undefined;
          }

          case "update":
          case "remove": {
            if (subset.length && !(await select(type, [["id", "=", key], ...subset], 1)).length)
              return;

            if (request.op == "update")
              await type.update(key as any, own(request.data) as any);
            else
              await type.delete(key as any);

            return;
          }
        }
      }
      catch (error) {
        throw error instanceof RemoteError ? error : new RemoteError("failed", "Request failed.", error);
      }
    };
  }

  async select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number){
    const [type, map] = target(this, table);
    const where = constraints.map(([column, op, value]) => (
      BARE.has(op) ? [map.key(column), op] : [map.key(column), op, value]
    ) as Remote.Constraint);

    const rows: Remote.Values[] = await send(this, { v: 1, op: "select", type, where, limit, offset });

    return rows.map(map.row);
  }

  async insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict){
    const [type, map] = target(this, table);
    const request: Remote.Request = { v: 1, op: "insert", type, data: map.values(data), returns };

    if (conflict)
      request.conflict = {
        on: conflict.on.map(map.key),
        update: [...conflict.update || [], ...Object.keys(conflict.set || {})].map(map.key)
      };

    const row = await send(this, request);

    return row && map.row(row);
  }

  async update(table: string, id: Connection.Key, data: Record<string, any>){
    const [type, map] = target(this, table);
    await send(this, { v: 1, op: "update", type, id: map.id(id), data: map.values(data) });
  }

  async remove(table: string, id: Connection.Key){
    const [type, map] = target(this, table);
    await send(this, { v: 1, op: "remove", type, id: map.id(id) });
  }
}

function show(value: unknown){
  try {
    return JSON.stringify(value);
  }
  catch {
    return String(value);
  }
}

function served(connection: Connection.Ready, key: string){
  return [...connection.using].find(type => (
    NAMED.get(type) === key && type.connection === connection
  )) as Entity | undefined;
}

function locate(type: Entity, value: Remote.Id){
  const { parts } = type.fields.get("id")!;

  if (!parts) {
    if (typeof value != "string" && typeof value != "number")
      throw new RemoteError("malformed", `${type.name} needs an id, not ${show(value)}.`);

    return value;
  }

  if (!value || typeof value != "object" || Object.keys(value).length != parts.length || parts.some(part => !(part.key in value)))
    throw new RemoteError("malformed", `${type.name} needs an id of ${parts.map(part => part.key)}.`);

  return parts.map(part => value[part.key]);
}

function send(remote: Connection, request: Remote.Request){
  return SEND.get(remote)!(request);
}

function target(remote: Connection, table: string){
  for (const type of remote.using)
    if ((type as Entity).ref === table) {
      const key = NAMED.get(type);

      if (key === undefined)
        throw new Error(`Type ${type.name} is not bound by key, so it cannot be sent.`);

      return [key, names(type)] as const;
    }

  throw new Error(`Table ${table} is not used by this connection.`);
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
  const set = await type.prepare({}, true);
  const update: string[] = [];

  for (const name of conflict.update || []) {
    const field = type.fields.get(name)!;

    if (!field.fixed && !field.primary && !on.includes(field.column) && !(field.column in set) && !(name in (type.subset || {})))
      update.push(field.column);
  }

  return update.length ? { on, update, set } : { on };
}

function valid(input: unknown): Remote.Request {
  const fail = (): never => {
    throw new RemoteError("malformed", "Malformed request.");
  };

  const object = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value == "object" && !Array.isArray(value)
  );

  const names = (value: unknown) => Array.isArray(value) && value.every(item => typeof item == "string");
  const count = (value: unknown) => value == null || Number.isSafeInteger(value) && (value as number) >= 0;

  if (!object(input) || typeof input.type != "string")
    return fail();

  if (input.v !== 1)
    throw new RemoteError("version", `Request version ${show(input.v)} is not supported.`);

  const request = { ...input } as Remote.Request;

  switch (request.op) {
    case "select":
      if (!Array.isArray(request.where) || request.where.length > 100 || !count(request.limit) || !count(request.offset))
        return fail();

      request.where = request.where.map(item => {
        if (!Array.isArray(item) || typeof item[0] != "string" || !OPS.has(item[1]))
          return fail();

        const [name, op, value] = item;

        if (BARE.has(op))
          return [name, op];

        if (value === undefined || (op == "IN" || op == "NOT IN") != Array.isArray(value) || Array.isArray(value) && value.length > 1000)
          return fail();

        if (op == "LIKE" && typeof value != "string")
          return fail();

        return [name, op, value];
      });

      return request;

    case "insert":
      if (!object(request.data) || request.returns !== undefined && typeof request.returns != "boolean")
        return fail();

      if (request.conflict !== undefined && (
        !object(request.conflict) || !names(request.conflict.on) || !request.conflict.on.length || request.conflict.update !== undefined && !names(request.conflict.update)
      ))
        return fail();

      return request;

    case "update":
      return object(request.data) && request.id !== undefined ? request : fail();

    case "remove":
      return request.id !== undefined ? request : fail();

    default:
      return fail();
  }
}

export { Remote };
