import { Builder, Field, Parameter, Query, Type } from '@expressive/orm';

declare namespace Connection {
  type Types =
    | Query.Table[]
    | { [key: string | number]: Query.Table };

  type Ready<T extends Connection = Connection> = Omit<T, "then">;
}

function ref({ schema, table }: Query.Table){
  return schema ? `${schema}.${table}` : table;
}

abstract class Connection implements Type.Connection {
  readonly using: Readonly<Set<Query.Table>>;
  readonly ready: boolean = false;

  constructor(using: Connection.Types){
    this.using = new Set(Object.values(using).map(type => {
      if(type.hasOwnProperty('connection'))
        throw new Error(`Type ${type.name} already has assigned connection.`);

      type.connection = this;
      return type;
    }))
  }

  async then(
    onfulfilled?: (value: Connection.Ready<this>) => any,
    onrejected?: (reason: any) => any) {

    return (this.ready ? Promise.resolve() : this.sync())
      .then(() => {
        Object.defineProperty(this, 'then', { value: undefined });

        if (onfulfilled)
          onfulfilled(this);
      })
      .catch(onrejected);
  }

  abstract get schema(): string;

  async close(){
    for(const type of this.using)
      delete type.connection;
  }

  abstract sync(fix?: boolean): Promise<this>;

  abstract prepare(builder: Builder): Builder.Statement;

  async get(table: string, constraints: Type.Constraint[], limit?: number, offset?: number){
    const { builder, target, bind, run } = statement(this, table);

    for (const [column, op, value] of constraints) {
      const field = lookup(target, column);

      if (op === 'asc' || op === 'desc')
        builder.order.set(field, op);
      else if (op === 'IS NULL')
        builder.filters.add(field, '=', null);
      else if (op === 'IS NOT NULL')
        builder.filters.add(field, '<>', null);
      else if (value === null)
        builder.filters.add(field, op, null);
      else
        builder.filters.add(field, op, Array.isArray(value) ? value.map(bind) : bind(value));
    }

    builder.limit = limit;
    builder.offset = offset;
    builder.commit(target.proxy);

    const rows = await this.prepare(builder).all(run());

    return rows.map(raw => decode(builder, raw));
  }

  async insert(table: string, data: Record<string, any>, returns?: boolean){
    const { builder, target, bind, run } = statement(this, table);
    const values: Builder.Insert = new Map();

    for (const field of target.fields.values())
      if (field.column in data)
        values.set(field, bind(data[field.column]));

    builder.inserts.set(target, values);

    if (!returns)
      return this.prepare(builder).run(run());

    builder.commit(target.proxy);

    const [row] = await this.prepare(builder).all(run());

    return decode(builder, row);
  }

  async update(table: string, id: string | number, data: Record<string, any>){
    const { builder, target, bind, run } = statement(this, table);
    const values: Builder.Insert = new Map();

    for (const column in data)
      values.set(lookup(target, column), bind(data[column]));

    builder.updates.set(target, values);
    builder.filters.add(target.fields.get("id")!, '=', bind(id));

    await this.prepare(builder).run(run());
  }

  async remove(table: string, id: string | number){
    const { builder, target, bind, run } = statement(this, table);

    builder.deletes.add(target);
    builder.filters.add(target.fields.get("id")!, '=', bind(id));

    await this.prepare(builder).run(run());
  }
}

function statement(connection: Connection, table: string){
  const type = Array.from(connection.using).find(type => ref(type) === table);

  if (!type)
    throw new Error(`Table ${table} is not used by this connection.`);

  const builder = new Builder();
  const target = builder.tables.get(builder.use(type))!;
  const params: unknown[] = [];

  return {
    builder,
    target,
    bind(value: unknown){
      const param = new Parameter(params.length);

      params.push(value);
      builder.params.push(param);

      return param;
    },
    run: () => builder.accept(params)
  };
}

function lookup(table: Builder.ITable, column: string){
  for (const field of table.fields.values())
    if (field.column === column)
      return field;

  throw new Error(`Column ${column} does not exist in ${table.name}.`);
}

function decode(builder: Builder, raw: Record<string, any>){
  const row: Record<string, any> = {};

  (builder.returns as Map<string, Field>).forEach((field, key) => {
    row[field.column] = raw[key];
  });

  return row;
}

export { Connection };
