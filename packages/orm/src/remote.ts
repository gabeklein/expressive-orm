import { Connection, NAMED } from './Connection';
import type { Query } from './query/Query';
import type { Type } from './Type';

declare namespace Remote {
  /** Values by property name. */
  type Values = Record<string, unknown>;

  /** A request as it travels - classes by the key they are bound under, fields by property, never table or column. */
  type Request =
    | { op: "select"; type: string; where: Type.Constraint[]; limit?: number; offset?: number }
    | { op: "insert"; type: string; data: Values; returns?: boolean; conflict?: Conflict }
    | { op: "update"; type: string; id: Connection.Key; data: Values }
    | { op: "remove"; type: string; id: Connection.Key };

  /** `Connection.Conflict` by property. */
  interface Conflict {
    on: string[];
    update?: string[];
    set?: Values;
  }

  /** Delivers a request to `Remote.handle` on the other side, resolving its result. */
  type Send = (request: Request) => Promise<any>;
}

const SEND = new WeakMap<Connection, Remote.Send>();

/**
 * A connection forwarding every read and write to another, through `send`.
 *
 * Requests name each class by the key it is bound under and each field by its property, so the far side
 * resolves both against its own classes - tables and columns never leave it. Bind classes as an object,
 * the same keys on both sides. No `Query`, transactions or live rows.
 *
 * @example
 * const db = Remote.new({ User, Post }, request => api.database(request));
 */
class Remote extends Connection {
  constructor(using: Connection.Types, send: Remote.Send){
    super(using);
    SEND.set(this, send);
  }

  /**
   * Serve requests from a `Remote` on `connection` - resolves a function taking each request and resolving its result.
   *
   * Only classes `connection` binds by key are reachable, by that key. An unknown class or property rejects.
   * Values are checked and stored by `connection` as any write; its `before` and `after` hooks run.
   *
   * @example
   * const serve = Remote.handle(db);
   * const database = (request: Remote.Request) => serve(request);
   */
  static handle(connection: Connection){
    return async (request: Remote.Request): Promise<any> => {
      const type = [...connection.using].find(type => NAMED.get(type) === request.type);

      if (!type)
        throw new Error(`Type ${request.type} is not served by this connection.`);

      const { ref } = type as Query.Table & { ref: string };
      const map = names(type);

      switch (request.op) {
        case "select": {
          const rows = await connection.select(ref, request.where.map(([key, ...rest]) => [map.column(key), ...rest]), request.limit, request.offset);
          return rows.map(map.keys);
        }

        case "insert": {
          const { on, update, set } = request.conflict || {};
          const conflict = on && {
            on: on.map(map.column),
            update: update && update.map(map.column),
            set: set && map.columns(set)
          };

          const row = await connection.insert(ref, map.columns(request.data), request.returns, conflict);
          return row && map.keys(row);
        }

        case "update":
          return connection.update(ref, request.id, map.columns(request.data));

        case "remove":
          return connection.remove(ref, request.id);

        default:
          throw new Error(`Unsupported request: ${(request as { op: unknown }).op}`);
      }
    };
  }

  async select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number){
    const [type, map] = this._target(table);
    const where = constraints.map(([column, ...rest]) => [map.key(column), ...rest] as Type.Constraint);
    const rows: Remote.Values[] = await this._send({ op: "select", type, where, limit, offset });

    return rows.map(map.row);
  }

  async insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict){
    const [type, map] = this._target(table);
    const request: Remote.Request = { op: "insert", type, data: map.values(data), returns };

    if (conflict)
      request.conflict = {
        on: conflict.on.map(map.key),
        update: conflict.update && conflict.update.map(map.key),
        set: conflict.set && map.values(conflict.set)
      };

    const row = await this._send(request);

    return row && map.row(row);
  }

  async update(table: string, id: Connection.Key, data: Record<string, any>){
    const [type, map] = this._target(table);
    await this._send({ op: "update", type, id, data: map.values(data) });
  }

  async remove(table: string, id: Connection.Key){
    const [type] = this._target(table);
    await this._send({ op: "remove", type, id });
  }

  _send(request: Remote.Request){
    return SEND.get(this)!(request);
  }

  _target(table: string){
    for (const type of this.using)
      if ((type as Query.Table & { ref: string }).ref === table) {
        const key = NAMED.get(type);

        if (key === undefined)
          throw new Error(`Type ${type.name} is not bound by key, so it cannot be sent.`);

        const map = names(type);

        return [key, {
          key: map.key,
          values: map.keys,
          row: (values: Remote.Values) => map.columns(values, true)
        }] as const;
      }

    throw new Error(`Table ${table} is not used by this connection.`);
  }
}

function names(type: Query.Table){
  const columns = new Map<string, string>();
  const keys = new Map<string, string>();

  for (const field of type.fields.values())
    if (!field.absent) {
      columns.set(field.key, field.column);
      keys.set(field.column, field.key);
    }

  function rename(from: Map<string, string>, what: string){
    return (name: string) => {
      const to = from.get(name);

      if (to === undefined)
        throw new Error(`${type.name} has no ${what} ${name}.`);

      return to;
    };
  }

  const column = rename(columns, "property");
  const key = rename(keys, "column");

  return {
    column,
    key,
    columns(values: Remote.Values, lenient?: boolean){
      const out: Record<string, unknown> = {};

      for (const name in values)
        if (!lenient || columns.has(name))
          out[column(name)] = values[name];

      return out;
    },
    keys(row: Record<string, unknown>){
      const out: Remote.Values = {};

      for (const name in row)
        if (keys.has(name))
          out[keys.get(name)!] = row[name];

      return out;
    }
  };
}

export { Remote };
