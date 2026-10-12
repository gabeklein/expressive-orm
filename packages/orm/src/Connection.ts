import { State } from '@expressive/mvc';

import type { Builder } from './query/Builder';
import type { Query } from './query/Query';
import type { Type } from './Type';

declare namespace Connection {
  type Types =
    | Query.Table[]
    | { [key: string | number]: Query.Table };

  type Ready<T extends Connection = Connection> = Omit<T, "then">;

  type Change = {
    table: string;
    op: "insert" | "update" | "delete";
    id: string | number;
    row?: Record<string, unknown>;
  };
}

abstract class Connection extends State {
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

  static new<T extends State, A extends unknown[]>(this: new (...args: A) => T, ...args: A): T {
    return State.new.apply(this as any, args as any) as T;
  }

  async then(
    onfulfilled?: (value: Connection.Ready<this>) => any,
    onrejected?: (reason: any) => any) {

    return (this.ready || !this.sync ? Promise.resolve() : this.sync())
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

  abstract insert(table: string, data: Record<string, any>, returns?: boolean): Promise<any>;

  abstract update(table: string, id: string | number, data: Record<string, any>): Promise<void>;

  abstract remove(table: string, id: string | number): Promise<void>;

  prepare?(builder: Builder): Builder.Statement;

  subscribe?(listener: (change: Connection.Change) => void): () => void;

  sync?(fix?: boolean): Promise<unknown>;
}

export { Connection };
