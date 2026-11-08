import { Builder, Connection, evaluate, Field, Parameter, Query, Type } from '@expressive/orm';
import { ChangeStream, ChangeStreamDocument, ClientSession, Db, Document, MongoClient } from 'mongodb';

import { Bind, compile, Plan } from './compile';
import { constrain, identify, locate, path, toDoc, toRow } from './filter';

type Row = Record<string, any>;

const COUNTERS = "__counters";
const NUMERIC: Document = { _id: { $type: "number" } };

class MongoConnection extends Connection {
  client: MongoClient;
  db: Db;

  _owned: boolean;
  _streams = new Set<ChangeStream>();
  _seeded = new Map<string, Promise<unknown>>();

  constructor(using: Connection.Types, client: MongoClient | string, name?: string) {
    super(using);

    this._owned = typeof client == "string";
    this.client = typeof client == "string" ? new MongoClient(client) : client;
    this.db = this.client.db(name);
  }

  _options() {
    const session = this._journal()?.session as ClientSession | undefined;

    return session ? { session } : {};
  }

  _collection(name: string) {
    return this.db.collection(name);
  }

  _key(name: string) {
    for (const type of [...this.using, ...this._loaded.keys()])
      if (ref(type) === name)
        return type.fields.get("id")!;

    return new Field("id");
  }

  _counters() {
    return this.db.collection<{ _id: string; seq: number }>(COUNTERS);
  }

  _seed(name: string) {
    let seeded = this._seeded.get(name);

    if (!seeded)
      this._seeded.set(name, seeded = this._collection(name)
        .find(NUMERIC, { projection: { _id: 1 }, sort: { _id: -1 }, limit: 1 })
        .toArray()
        .then(([last]) => this._bump(name, last?._id)));

    return seeded;
  }

  async _next(name: string) {
    await this._seed(name);

    const counter = await this._counters().findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );

    return counter!.seq;
  }

  async _bump(name: string, id: unknown) {
    if (typeof id == "number")
      await this._counters().updateOne(
        { _id: name },
        { $max: { seq: id } },
        { upsert: true }
      );
  }

  async _identify(name: string, data: Row, key: Field) {
    if (key.parts)
      return { ...data };

    if (data[key.column] === undefined)
      return { [key.column]: await this._next(name), ...data };

    await this._bump(name, data[key.column]);

    return { ...data };
  }

  async _add(name: string, data: Row, key = this._key(name)) {
    const row = await this._identify(name, data, key);

    await this._collection(name).insertOne(toDoc(key, row), this._options());

    return row;
  }

  async select(name: string, constraints: Type.Constraint[], limit?: number, offset?: number) {
    const key = this._key(name);
    const { filter, sort } = constrain(key, constraints);
    const docs = await this._collection(name)
      .find(filter, { ...this._options(), sort, skip: offset, limit })
      .toArray();

    return docs.map(doc => toRow(key, doc));
  }

  async insert(name: string, data: Row, returns?: boolean, conflict?: Connection.Conflict): Promise<any> {
    const key = this._key(name);

    if (!conflict || conflict.on.some(column => data[column] === undefined)) {
      const row = await this._add(name, data, key);

      return returns ? row : undefined;
    }

    const collection = this._collection(name);
    const options = this._options();
    const filter = Object.fromEntries(conflict.on.map(column => [path(key, column), data[column]]));

    const update = async () => {
      const assign: Row = { ...conflict.set };

      for (const column of conflict.update!)
        assign[column] = data[column] ?? null;

      if (!key.parts)
        delete assign[key.column];

      const updated = await collection.findOneAndUpdate(filter, { $set: assign }, { ...options, returnDocument: "after" });

      return updated && (returns ? toRow(key, updated) : undefined);
    };

    if (conflict.update) {
      const updated = await update();

      if (updated !== null)
        return updated;
    }

    const row = await this._identify(name, data, key);
    const doc = toDoc(key, row);

    for (const field in filter)
      delete doc[field];

    const result = await collection.findOneAndUpdate(
      filter,
      { $setOnInsert: doc },
      { ...options, upsert: true, includeResultMetadata: true }
    );

    if (result.lastErrorObject?.updatedExisting)
      return conflict.update ? update() : undefined;

    return returns ? row : undefined;
  }

  async update(name: string, id: Connection.Key, data: Row) {
    const key = this._key(name);
    const collection = this._collection(name);
    const options = this._options();
    const filter = locate(key, id);
    const { [key.column]: next, ...rest } = data;

    if (!key.parts && next !== undefined && next !== id) {
      for (const doc of await collection.find(filter, options).toArray()) {
        await collection.insertOne({ ...doc, ...rest, _id: next }, options);
        await collection.deleteOne({ _id: doc._id }, options);
      }

      await this._bump(name, next);
      return;
    }

    const assign = key.parts ? data : rest;

    if (Object.keys(assign).length)
      await collection.updateMany(filter, { $set: assign }, options);
  }

  async remove(name: string, id: Connection.Key) {
    await this._collection(name).deleteMany(locate(this._key(name), id), this._options());
  }

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    const session = this.client.startSession();

    this._journal()!.session = session;

    try {
      session.startTransaction();

      const result = await fn();

      await session.commitTransaction();

      return result;
    }
    catch (error) {
      if (session.inTransaction())
        await session.abortTransaction();

      throw error;
    }
    finally {
      await session.endSession();
    }
  }

  subscribe(listener: (change: Connection.Change) => void) {
    const stream = this.db.watch([], { fullDocument: "updateLookup" });

    stream.on("change", event => {
      const change = this._change(event);

      if (change)
        listener(change);
    });

    stream.on("error", () => {
      this._streams.delete(stream);
      stream.close();
    });

    this._streams.add(stream);

    return () => {
      this._streams.delete(stream);
      stream.close();
    };
  }

  _change(event: ChangeStreamDocument): Connection.Change | undefined {
    if (!("ns" in event) || !("documentKey" in event) || event.ns.coll == COUNTERS)
      return;

    const table = event.ns.coll!;
    const key = this._key(table);
    const full = "fullDocument" in event && event.fullDocument ? toRow(key, event.fullDocument) : undefined;
    const id = key.parts ? full && identify(key, full) : event.documentKey._id;

    if (id === undefined)
      return;

    switch (event.operationType) {
      case "insert":
        return { table, op: "insert", id, row: full };

      case "update": {
        const { updatedFields = {}, removedFields = [] } = event.updateDescription;
        const row: Row = { ...updatedFields };

        removedFields.forEach(field => row[field] = null);

        return { table, op: "update", id, row };
      }

      case "replace":
        return { table, op: "update", id, row: full };

      case "delete":
        return { table, op: "delete", id };
    }
  }

  async sync() {
    const existing = new Set(
      (await this.db.listCollections({}, { nameOnly: true }).toArray()).map(info => info.name)
    );

    for (const type of this.using) {
      const name = ref(type);
      const collection = this._collection(name);
      const key = type.fields.get("id")!;

      if (!existing.has(name))
        await this.db.createCollection(name);

      if (key.parts)
        await collection.createIndex(
          Object.fromEntries(key.parts.map(part => [part.column, 1])),
          { unique: true, name: `${type.table}_id` }
        );

      for (const field of type.fields.values()) {
        if (field.primary || field.absent || !field.unique && !field.index)
          continue;

        const name = typeof field.index == "string" ? field.index : `${type.table}_${field.column}`;

        await collection.createIndex({ [field.column]: 1 }, field.unique
          ? { name, unique: true, ...field.nullable && { partialFilterExpression: { [field.column]: { $exists: true, $type: ["string", "number", "bool", "date", "objectId"] } } } }
          : { name });
      }
    }
  }

  async close() {
    for (const stream of this._streams)
      await stream.close();

    this._streams.clear();

    if (this._owned)
      await this.client.close();

    await super.close();
  }

  _store(): evaluate.Store {
    const ids = new WeakMap<Row, unknown>();
    const options = this._options();
    const key = (table: evaluate.Table) => table.type.fields.get("id")!;
    const id = (primary: Field, row: Row) => primary.parts ? ids.get(row) : row[primary.column];

    return {
      rows: async (table, where) => {
        const primary = key(table);
        const docs = await this._collection(table.name).find(constrain(primary, where).filter, options).toArray();

        return docs.map(doc => {
          const row = toRow(primary, doc);

          ids.set(row, doc._id);
          return row;
        });
      },
      insert: (table, row) => this._add(table.name, row, key(table)),
      update: async (table, row, assign) => {
        const primary = key(table);

        if (primary.parts)
          await this._collection(table.name).updateOne({ _id: id(primary, row) as any }, { $set: assign }, options);
        else
          await this.update(table.name, id(primary, row), assign);

        Object.assign(row, assign);
      },
      delete: async (table, rows) => {
        const primary = key(table);

        await this._collection(table.name).deleteMany({ _id: { $in: rows.map(row => id(primary, row) as any) } }, options);
      }
    };
  }

  prepare(builder: Builder): Builder.Statement {
    const plan = compile(builder);
    const bind = (params: unknown[] = []): Bind => param => params[builder.params.indexOf(param)];

    if (!plan)
      return {
        all: async params => (await evaluate(this._store(), builder, params!)).rows!,
        run: async params => (await evaluate(this._store(), builder, params!)).count,
        toString: () => `evaluate\n${builder}`
      };

    return {
      all: async params => {
        const { pipeline, read } = plan as Extract<Plan, { kind: "read" }>;
        const docs = await this._collection(plan.from).aggregate(pipeline(bind(params)), this._options()).toArray();

        return docs.map(read);
      },
      run: params => this._run(plan, bind(params)),
      toString: () => render(plan)
    };
  }

  async _run(plan: Plan, bind: Bind): Promise<number> {
    const collection = this._collection(plan.from);
    const options = this._options();

    switch (plan.kind) {
      case "update": {
        const set = plan.set(bind);

        if (!Object.keys(set).length)
          return collection.countDocuments(plan.filter(bind), options);

        return (await collection.updateMany(plan.filter(bind), { $set: set }, options)).matchedCount;
      }

      case "delete":
        return (await collection.deleteMany(plan.filter(bind), options)).deletedCount;

      default: {
        const [result] = await collection.aggregate(plan.pipeline(bind), options).toArray();

        return result ? result.count : 0;
      }
    }
  }
}

function ref({ schema, table }: Query.Table) {
  return schema ? `${schema}.${table}` : table;
}

function render(plan: Plan) {
  const bind: Bind = (param: Parameter) => String(param);
  const json = (value: unknown) => JSON.stringify(value);

  switch (plan.kind) {
    case "update":
      return `db.${plan.from}.updateMany(${json(plan.filter(bind))}, ${json({ $set: plan.set(bind) })})`;

    case "delete":
      return `db.${plan.from}.deleteMany(${json(plan.filter(bind))})`;

    default:
      return `db.${plan.from}.aggregate(${json(plan.pipeline(bind))})`;
  }
}

export { MongoConnection };
