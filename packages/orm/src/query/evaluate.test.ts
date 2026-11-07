import { describe, expect, it, vi } from 'vitest';

import { Connection } from '../Connection';
import { date, num, str } from '../fields';
import { one } from '../one';
import { Type } from '../Type';
import { Builder } from './Builder';
import { evaluate } from './evaluate';
import { Query } from './Query';
import { now } from './Value';

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

  it("will pass a table's own conditions to the store", async () => {
    class Note extends Type {
      static connection = db;
      static table = "note";
      post_id = num();
      text = str(null);
      at = date(null);
    }

    db.data.note = [];
    vi.mocked(db.store.rows).mockClear();

    const query = Query((where, fn) => (min: number) => {
      const post = where(Post);
      const note = where(Note, true);

      where(note.post_id).equal(post.views);
      where(post.views).over(min);
      where(post.title).in(["first", "third"]);
      where(post.title).not(post.author.name);
      where(post.views).under(fn.add(post.views, 100));
      where(where(post.id).equal(1), where(post.id).equal(3));
      where(note.text).equal(null);
      where(note.at).under(now);
    });

    await query(0);

    expect(db.store.rows).toHaveBeenCalledWith(expect.objectContaining({ name: "post" }), [
      ["views", ">", 0],
      ["title", "IN", ["first", "third"]]
    ]);
    expect(db.store.rows).toHaveBeenCalledWith(expect.objectContaining({ name: "author" }), []);
    expect(db.store.rows).toHaveBeenCalledWith(expect.objectContaining({ name: "note" }), []);
  })

  it("will pass null conditions to the store", async () => {
    class Tag extends Type {
      static connection = db;
      static table = "tag";
      label = str(null);
      color = str(null);
      size = num(null);
    }

    db.data.tag = [{ id: 1, label: null, color: "red", size: null }];
    vi.mocked(db.store.rows).mockClear();

    const query = Query(where => {
      const tag = where(Tag);

      where(tag.label).equal(null);
      where(tag.color).not(null);
      where(tag.size).over(null as any);

      return tag.id;
    });

    await expect(query).resolves.toEqual([]);
    expect(db.store.rows).toHaveBeenCalledWith(expect.anything(), [
      ["label", "IS NULL"],
      ["color", "IS NOT NULL"]
    ]);
  })

  it("will update each row once", async () => {
    const query = Query(where => {
      const post = where(Post);

      where(post.author).update({ name: "Writer" });
    });

    vi.mocked(db.store.update).mockClear();

    await expect(query).resolves.toBe(2);
    expect(db.store.update).toHaveBeenCalledTimes(2);
  })

  it("will update through the store", async () => {
    const query = Query(where => {
      const post = where(Post);

      where(post.views).under(6);
      where(post).update({ views: 0 });
    });

    await expect(query).resolves.toBe(2);
    expect(db.store.update).toHaveBeenCalledTimes(4);
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
