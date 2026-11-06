import { describe, expect, it, vi } from 'vitest';

import { Connection } from '../Connection';
import { num, str } from '../fields';
import { one } from '../one';
import { Type } from '../Type';
import { Builder } from './Builder';
import { evaluate } from './evaluate';
import { Query } from './Query';

type Row = evaluate.Row;

class Store extends Connection {
  data: Record<string, Row[]> = {};

  store: evaluate.Store = {
    rows: vi.fn(async table => this.data[table.name] ||= []),
    insert: vi.fn(async (table, row) => {
      const rows = this.data[table.name] ||= [];
      const added = { id: rows.length + 1, ...row };

      rows.push(added);

      return added;
    }),
    update: vi.fn(async (_table, row, assign) => {
      Object.assign(row, assign);
    }),
    delete: vi.fn(async (table, rows) => {
      this.data[table.name] = this.data[table.name].filter(row => !rows.includes(row));
    })
  };

  prepare(query: Builder): Builder.Statement {
    return {
      all: async params => (await evaluate(this.store, query, params!)).rows!,
      run: async params => (await evaluate(this.store, query, params!)).count,
      toString: () => String(query)
    };
  }

  select = vi.fn();
  insert = vi.fn();
  update = vi.fn();
  remove = vi.fn();
}

describe("custom store", () => {
  const db = new Store();

  class Author extends Type {
    static connection = db;
    static table = "author";
    name = str();
  }

  class Post extends Type {
    static connection = db;
    static table = "post";
    author = one(Author);
    title = str();
    views = num();
  }

  db.data = {
    author: [{ id: 1, name: "Ann" }, { id: 2, name: "Ben" }],
    post: [
      { id: 1, author_id: 1, title: "first", views: 10 },
      { id: 2, author_id: 2, title: "second", views: 5 },
      { id: 3, author_id: 1, title: "third", views: 1 }
    ]
  };

  it("will join rows from an async store", async () => {
    const query = Query(where => {
      const post = where(Post);

      where(post.author.name).equal("Ann");
      where(post.views).desc();

      return post.title;
    });

    await expect(query).resolves.toEqual(["first", "third"]);
    expect(db.store.rows).toHaveBeenCalledTimes(2);
  })

  it("will update through the store", async () => {
    const query = Query(where => {
      const post = where(Post);

      where(post.views).under(6);
      where(post).update({ views: 0 });
    });

    await expect(query).resolves.toBe(2);
    expect(db.store.update).toHaveBeenCalledTimes(2);
    expect(db.data.post.map(row => row.views)).toEqual([10, 0, 0]);
  })

  it("will delete through the store", async () => {
    const query = Query(where => {
      const post = where(Post);

      where(post.views).equal(0);
      where(post).delete();
    });

    await expect(query).resolves.toBe(2);
    expect(db.store.delete).toHaveBeenCalledOnce();
    expect(db.data.post.map(row => row.title)).toEqual(["first"]);
  })
})
