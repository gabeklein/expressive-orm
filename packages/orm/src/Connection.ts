import { Model } from '@expressive/mvc';

import type { Builder } from './query/Builder';
import type { Query } from './query/Query';
import type { Type } from './Type';

declare namespace Connection {
  type Types =
    | Query.Table[]
    | { [key: string | number]: Query.Table };

  type Ready<T extends Connection = Connection> = Omit<T, "then">;

  type Key = string | number | readonly (string | number)[];

  type Conflict = {
    on: string[];
    update?: string[];
  };

  type Journal = {
    undo: (() => void)[];
    done: (() => void)[];
  };

  type Change = {
    table: string;
    op: "insert" | "update" | "delete";
    id: Key;
    row?: Record<string, unknown>;
  };
}

const synced = new WeakMap<Connection, Promise<unknown>>();
const COLLECT = Symbol.for("@expressive/orm.collect");

abstract class Connection extends Model {
  readonly using: ReadonlySet<Query.Table>;
  readonly ready: boolean = false;

  _loaded = new Map<Type.Class, Map<unknown, Type>>();

  constructor(using: Connection.Types = []){
    super();

    this.using = new Set(Object.values(using).map(type => {
      if (type.hasOwnProperty('connection'))
        throw new Error(`Type ${type.name} already has assigned connection.`);

      type.connection = this;
      return type;
    }));

    this.get(null, () => {
      for (const type of this.using)
        if (type.connection === this)
          delete type.connection;

      for (const loaded of this._loaded.values())
        for (const entity of loaded.values())
          entity.set(null);

      this._loaded.clear();
    });
  }

  static new<T extends Model, A extends unknown[]>(this: new (...args: A) => T, ...args: A): T {
    return Model.new.apply(this as any, args as any) as T;
  }

  async then(
    onfulfilled?: (value: Connection.Ready<this>) => any,
    onrejected?: (reason: any) => any) {

    const collect = (globalThis as { [COLLECT]?: Set<Connection> })[COLLECT];
    let sync = synced.get(this);

    if (collect)
      collect.add(this);

    if (this.ready || !this.sync || collect)
      sync = Promise.resolve();
    else if (!sync)
      synced.set(this, sync = this.sync());

    return sync
      .then(() => {
        Object.defineProperty(this, 'then', { value: undefined });

        if (onfulfilled)
          onfulfilled(this);
      })
      .catch(onrejected);
  }

  async close(){
    this.set(null);
  }

  abstract select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number): Promise<any[]>;

  abstract insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict): Promise<any>;

  abstract update(table: string, id: Connection.Key, data: Record<string, any>): Promise<void>;

  abstract remove(table: string, id: Connection.Key): Promise<void>;

  _journal(): Connection.Journal | undefined {
    return undefined;
  }

  transaction?<T>(fn: () => T | Promise<T>): Promise<T>;

  prepare?(builder: Builder): Builder.Statement;

  subscribe?(listener: (change: Connection.Change) => void): () => void;

  sync?(fix?: boolean): Promise<unknown>;
}

export { Connection };
