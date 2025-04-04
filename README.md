<br/>

<p align="center">
  <img height="90" src=".github/logo.svg" alt="Expressive Logo"/>
  <h1 align="center">
    Expressive ORM
  </h1>
</p>

<h4 align="center">
  Accessible SQL for your apps.
</h4>
 
<p align="center">
  <a href="https://www.npmjs.com/package/@expressive/sql"><img alt="NPM" src="https://badge.fury.io/js/%40expressive%2Fsql.svg"></a>
</p>

<p align="center">
  Define classes to power your quries by extending <code>Table</code>.<br/>
  The <code>Query</code> factory helps you compose one-to-one SQL and execture them.<br/>
  Columns you return are selected and ready for type-safe use!<br/>
</p>

<br/>

> [!NOTE]  
> Library is experimental and documentation is in progress.
> Current README is geared as a tech demo to show what I'm working on! :)


<br/>
<h1 id="overview-section">Overview</h1>

Classes which extend `Table` can manage your data with high safety and convenience. This project aims to make using SQL in Javascript apps completely frictionless.

<br/>

## Benefits Over Other ORMs

- **No DSL or magic** - Everything is plain JavaScript/TypeScript
- **Type safety without decorators** - Full type inference without complex setup
- **SQL-first approach** - The API closely follows SQL semantics
- **Performance** - Very minimal overhead compared to raw SQL
- **Developer experience** - Intuitive API with great IDE support
- **Context agnostic** - The query system handles database syntax specifics for you.

<br/>



## Define your schema

With the base SQL module, we have a number of tools available to define an entire schema.

With simple factories, you can customize the columns, set types default values, read, write, and validate functions. 

```bash
npm i @expressive/sql
```
```ts
// src/database/tables.ts

import { Table, Str, Num, Bool, Time, One } from '@expressive/sql';
import { hash } from "./lib/passwords";

class User extends Table {
  name = Str();
  nickName = Str({ nullable: true });
  email = Str({ unique: true });
  password = Str({ type: "varchar", length: 40, set: hash });
  createdAt = Time({ fallback: "NOW" });
}

class Post extends Table {
  authorId = Num();
  title = Str();
  content = Str();
  published = Bool({ fallback: false });
  createdAt = Time({ fallback: "NOW" });
  updatedAt = Time({ nullable: true });
}

export { User, Post }
```

Tables you create are typesafe out the box! No special decorators or interface types needed.

```typescript
// lib/database/tables.d.ts (built with tsc)

declare class Table extends Base {
    id: Primary.Int;
}

declare class User extends Table {
    name: Str.Text;
    nickName: Str.Text & Nullable;
    email: Str.Text;
    password: Str.VarChar;
    createdAt: Time.Timestamp & Optional;
}

declare class Post extends Table {
    authorId: Num.Int;
    title: Str.Text;
    content: Str.Text;
    published: Bool.Boolean & Optional;
    createdAt: Time.Timestamp & Optional;
    updatedAt: Time.Timestamp & Nullable;
}

export { Post, User };
```

<br />

## Connecting to your database

Pick an adapter which fits your needs. Currently supported are
- postgres `@expressive/postgres` + `pg`
- pglite `@expressive/postgres` + `@electric-sql/pglite`
- sqlite `@expressive/sqlite` + `better-sqlite3`
- mysql `@expressive/mysql` + `mysql2`

<br />

For this example, we'll use Postgres.

```bash
npm i @expressive/postgres pg
```

```typescript
// src/database/index.ts

import { PGConnection } from '@expressive/postgres';

import * as tables from './tables';

// Create a connection and link them to your tables
export async function connect(){
  await new PostgresConnection(tables, {
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
  })
};

// We can reexport tables
export * from './tables';

// We can also export Query so we're all consolidated.
export { Query } from '@expressive/sql'
```
When you connect in this way, all `Table` classes you apply to the connection are checked against the schema of that database. If any mismatch the connection will throw - this ensures you will operate on the data you expect.

<br />

## Querying your data

The `Query` function is a powerful factory which generates both the actual query, and the parser which turns your results into javascript objects with the shape you returned. 

```typescript
import { Query, Post, User } from './database';

async function getPosts(){
  return await Query(where => {
    const post = where(Post);
    const author = where(User);
    
    where(post.authorId).equal(author.id); // This is a join equating two fields
    where(post.published).equal(true); // This WHERE clause filters a value
    
    return {
      title: post.title,
      author: author.name,
      content: post.content,
      date: post.createdAt
    };
  });
}
```
With `getPosts()` you receive an array of the same type you returned - your selection.

```typescript
declare function getPosts(): Promise<{
    title: string;
    author: string;
    content: string;
    date: Date;
}[]>
```

<br />

## Inserting Data

```typescript
// Insert a user
const userId = await User.insert({ 
  name: 'John Doe', 
  email: 'john@example.com',
  password: 'hashedpassword123'
});

// Insert a post
await Post.insert({
  title: 'Hello World',
  content: 'This is my first post!',
  published: true,
  author: userId
});
```

<br />

## Updating Data

The `Query` factory can also be used to update records!

```typescript
// John wants to set his account to private or something.
const count = await Query(where => {
  const post = where(Post);
  const user = where(User);

  where(post.userId).equals(user.id);
  where(user.email).equals("john@example.com");

  where(post).update({ 
    published: false
  });
});

// count === 10
```

<br />

# Concepts

### Tables

Tables are defined as classes that extend the `Table` base class. Each property represents a piece of data, usually a column, in the database.

<br />

```typescript
class Product extends Table {
  name = Str();
  price = Num({ type: 'numeric', precision: 10, scale: 2 });
  inStock = Bool({ fallback: true });
  description = Str({ nullable: true });
}
```

### Field Types

The library provides several field types to define your table columns:

- `Str()` - String fields (text, varchar, etc.)
- `Num()` - Numeric fields (integer, float, decimal, etc.)
- `Bool()` - Boolean fields
- `Time()` - Date and time fields
- `One()` - Foreign key relationship to another table

Each field type accepts options to customize the field's behavior, such as nullable, unique, length, etc.

### Query Builder

The query builder provides a fluent API for building SQL queries:

```typescript
const query = Query(where => {
  const user = where(User);
  const post = where(Post);
  
  // here, we declare a join by equating two fields.
  where(post.author).equal(user.id);

  // these are our where clauses.
  where(user.name).equal('John');
  where(post.published).equal(true);
  
  // this is our selection.
  return {
    content: post.content,
    author: user.name
  };
});

// Execute the query
const results = await query;

// Use results as needed.
console.log(`Found ${results.length} results.`)

// results are implicitly the types you returned in your Query factory.
// The real selection knows where to put the values, even if deeply nested.
for(const { content, author } of results)
  console.log(`${author} said: ${content}`)

/*
  Found 5 results.
  John said: Hello world!
  John said: I love SQL!
  John said: Expressive is next level!
  John said: Wow I can do so much with this!
  John said: SQL is the best!
*/

// You can also stringify a query to see generated SQL! 👀
console.log(query);

/*
  SELECT "post"."content", "user"."name" AS "author"
  FROM "post" AS "post"
  JOIN "user" AS "user" ON "post"."author_id" = "user"."id"
  WHERE "user"."name" = 'John'
  AND "post"."published" = true
*/
```

### Joins

The ORM makes it easy to join tables in your queries:

```typescript
const query = Query(where => {
  const post = where(Post);
  const user = where(User); // This defaults to an INNER JOIN.
  
  // Direct comparions between fields are considered ON conditions.
  where(post.author).equal(user.id);
  
  return {
    postTitle: post.title,
    authorName: user.name
  };
});
```

### Filtering

You can filter your queries using various operators. Javascript values and in-engine values are converted based on how the column was defined in the class.

```typescript
const query = Query(where => {
  const post = where(Post);
  
  where(post.published).equal(true);
  where(post.createdAt).over(new Date('2023-01-01'));
  where(post.title).not('Hello');
  
  return post;
});
```

### Complex Conditions

You can build complex conditions using nested groups:

```typescript
Query(where => {
  const post = where(Post);
  
  where(
    where(post.title).equal('Hello'),
    where(
      where(post.published).equal(true),
      where(post.createdAt).over(new Date('2023-01-01'))
    )
  );
  
  return post;
});
```
Translates to:
```sql
SELECT
  post.*
FROM
  post
WHERE
  post.title = 'Hello'
  OR (
    post.published = true
    AND post.created_at > '2023-01-01'
  )
```

### Custom Column Names

You can customize column names in the database:

```typescript
class User extends Table {
  firstName = Str({ column: 'first_name' });
  lastName = Str({ column: 'last_name' });
}
```

### Custom Table Names

You can customize the table using the Primary factory and overriding `id`:

```typescript
class BlogPost extends Table {
  id = Primary({
    tableName: "BasicBlogPost"
  })
  
  title = Str();
  content = Str();
}
```

### Data Validation

Fields automatically validate data:

```typescript
class Info extends Table {
  field = Num({ type: 'numeric', precision: 5, scale: 2 });
}

// Will throw validation error if value is out of range
await Info.insert({ field: 1000.123 })
// Error: Value of `field` exceeds precision
```

### Math Operations

You can perform mathematical operations in queries:

```typescript
const query = Query((where, fn) => {
  const { add, mul } = fn;
  const item = where(Item);

  return {
    total: mul(item.price, item.quantity),
    discounted: mul(item.price, sub(1, item.discount))
  };
});
```

<br/><br/>

<h2 align="center"> 🚧 More Docs are on the way! 🏗 </h2>
<p align="center">Documenation is actively being built out - stay tuned!</p>


<br/><br/>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.