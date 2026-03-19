<br/>

<p align="center">
  <img height="90" src=".github/logo.svg" alt="Expressive Logo"/>
  <h1 align="center">
    Expressive Query
  </h1>
</p>

<h4 align="center">
  Accessible SQL for your apps.
</h4>
 
<p align="center">
  <a href="https://www.npmjs.com/package/@expressive/sql"><img alt="NPM" src="https://badge.fury.io/js/%40expressive%2Fsql.svg"></a>
</p>

<p align="center">
  Define classes to power your queries by extending <code>Table</code>.<br/>
  The <code>Query</code> factory helps you compose one-to-one SQL and execute them.<br/>
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

## Benefits over other ORMs

- **No DSL or magic** - Everything is plain JavaScript/TypeScript
- **Type safety without decorators** - Full type inference without complex setup
- **Declarative and SQL-first** - The API closely follows SQL semantics - No chaining! ⛓️‍💥
- **Context agnostic** - The query system handles database syntax specifics for you.
- **Uber Extensible** - Fields and Tables can be extended and customized to fit most needs.
- **Performance** - Very minimal overhead over actual SQL clients, memory efficient at high volume. 

<br/>



## Define your schema

With the base SQL module, you can define your database schema using classes that extend `Table`. Field factories let you customize columns with types, defaults, validation, and more.

```bash
npm i @expressive/sql
```

```typescript
// src/database/tables.ts

import { Table, Str, Num, Bool, Time } from '@expressive/sql';
import { hash } from "./lib/passwords";

class User extends Table {
  // Fields without nullable option default to not nullable
  name = Str();
  email = Str({ unique: true });

  // Explicitly nullable fields
  nickName = Str({ nullable: true });

  // Custom type, length, and setter
  password = Str({ type: "varchar", length: 40, set: hash });

  // Fallback values (like SQL DEFAULT)
  createdAt = Time({ fallback: "NOW" });
}

class Post extends Table {
  authorId = Num();
  title = Str();
  content = Str();

  // Boolean with fallback
  published = Bool({ fallback: false });

  // Time fields
  createdAt = Time({ fallback: "NOW" });
  updatedAt = Time({ nullable: true });
}

export { User, Post }
```

Tables you create are type-safe out of the box! No special decorators or interface types needed.

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

### Field Types

The library provides several field type factories to define your table columns:

- `Str()` - String fields (text, varchar, etc.)
- `Num()` - Numeric fields (integer, float, decimal, etc.)
- `Bool()` - Boolean fields
- `Time()` - Date and time fields
- `One()` - Foreign key relationship to another table

Each field type accepts options to customize behavior:

```typescript
class Product extends Table {
  // Basic string field
  name = Str();

  // Varchar with length limit
  sku = Str({ type: 'varchar', length: 20 });

  // Numeric with precision
  price = Num({ type: 'numeric', precision: 10, scale: 2 });

  // Boolean with default
  inStock = Bool({ fallback: true });

  // Nullable field
  description = Str({ nullable: true });

  // Unique constraint
  barcode = Str({ unique: true, nullable: true });
}
```

<br />

## Connecting to your database

Pick an adapter which fits your needs:

```bash
# PostgreSQL
npm i @expressive/postgres pg

# PGLite (embedded PostgreSQL)
npm i @expressive/postgres @electric-sql/pglite

# SQLite
npm i @expressive/sqlite better-sqlite3

# MySQL
npm i @expressive/mysql mysql2
```

<br />

For this example, we'll use Postgres:

```typescript
// src/database/index.ts

import { PGConnection } from '@expressive/postgres';
import * as tables from './tables';

// Create a connection and link your tables
export async function connect() {
  await new PGConnection(tables, {
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

// Reexport tables for convenience
export * from './tables';

// Export Query so everything is consolidated
export { Query } from '@expressive/sql';
```

When you connect, all `Table` classes are validated against the database schema. If any mismatch is found, the connection will throw - ensuring you operate on the data you expect.

### Other Database Adapters

```typescript
// PGLite (embedded)
import { PGLiteConnection } from '@expressive/postgres';
await new PGLiteConnection(tables, { dataDir: './data' });

// SQLite
import { SQLiteConnection } from '@expressive/sqlite';
await new SQLiteConnection(tables, './database.db');

// MySQL
import { MySQLConnection } from '@expressive/mysql';
await new MySQLConnection(tables, {
  host: 'localhost',
  database: 'myapp',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
```

<br />

## Querying your data

The `Query` function is a powerful factory which generates both the SQL query and the parser that transforms results into JavaScript objects with the shape you specify.

```typescript
import { Query, Post, User } from './database';

async function getPosts() {
  return await Query(where => {
    const post = where(Post);
    const author = where(User);

    // Join tables by equating fields
    where(post.authorId).equal(author.id);

    // Filter with WHERE clauses
    where(post.published).equal(true);

    // Return the shape you want
    return {
      title: post.title,
      author: author.name,
      content: post.content,
      date: post.createdAt
    };
  });
}
```

The return type is automatically inferred from your selection:

```typescript
declare function getPosts(): Promise<{
    title: string;
    author: string;
    content: string;
    date: Date;
}[]>
```

### Return Variations

```typescript
// Return specific fields as an object
const results = await Query(where => {
  const user = where(User);
  return {
    name: user.name,
    email: user.email
  };
});

// Return entire table
const users = await Query(where => {
  const user = where(User);
  return user;
});

// Return a single field
const emails = await Query(where => {
  const user = where(User);
  return user.email;
});

// Return nested objects (generates SQL aliases)
const results = await Query(where => {
  const user = where(User);
  return {
    user: {
      id: user.id,
      name: user.name
    },
    contact: {
      email: user.email
    }
  };
});

// Count query (no return = COUNT(*))
const count = await Query(where => {
  const user = where(User);
  where(user.email).equal('test@example.com');
  // No return statement = COUNT(*)
});
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
  SELECT "post"."content" as "content", "user"."name" AS "author"
  FROM "post" AS "post"
  JOIN "user" AS "user" ON "post"."author_id" = "user"."id"
  WHERE "user"."name" = 'John'
  AND "post"."published" = true
*/
```

### Sorting & Limits

Sort results and limit the number of rows returned:

```typescript
// Sort by one field
await Query(where => {
  const user = where(User);
  where(user.createdAt).desc();
  return user;
});
// ORDER BY user.created_at DESC

// Multiple column sorting
await Query(where => {
  const user = where(User);
  where(user.email).asc();      // First by email
  where(user.createdAt).desc(); // Then by created date
  return user;
});
// ORDER BY user.email ASC, user.created_at DESC

// Limit results
await Query(where => {
  const user = where(User);
  where(10); // LIMIT 10
  return user;
});

// Combine sorting and limits
await Query(where => {
  const post = where(Post);
  where(post.createdAt).desc();
  where(5); // Get 5 most recent posts
  return post;
});
```

### Joins

Joins are created by comparing fields from different tables:

```typescript
const query = Query(where => {
  const post = where(Post);
  const user = where(User);

  // This creates an INNER JOIN
  where(post.authorId).equal(user.id);

  // Additional WHERE clauses
  where(post.published).equal(true);
  where(user.email).equal('john@example.com');

  return {
    postTitle: post.title,
    authorName: user.name,
    content: post.content
  };
});
```

```sql
SELECT post.title AS "postTitle", user.name AS "authorName", post.content AS "content"
FROM post
INNER JOIN user ON post.author_id = user.id
WHERE post.published = true AND user.email = 'john@example.com'
```

### Filtering

Filter your queries using various comparison operators. JavaScript values are automatically converted based on field type:

```typescript
const query = Query(where => {
  const post = where(Post);

  // Equal
  where(post.published).equal(true);

  // Not equal
  where(post.title).not('Hello');

  // Greater than
  where(post.createdAt).over(new Date('2023-01-01'));

  // Greater than or equal
  where(post.views).over(100, true);

  // Less than
  where(post.createdAt).under(new Date('2024-01-01'));

  // Less than or equal
  where(post.views).under(1000, true);

  // IN operator
  where(post.status).in(['draft', 'published']);

  return post;
});
```

### Grouping Conditions

By default, multiple conditions are combined with AND:

```typescript
await Query(where => {
  const user = where(User);

  // These are ANDed together
  where(user.email).equal('test@example.com');
  where(user.createdAt).over(new Date('2023-01-01'));

  return user;
});
// WHERE user.email = 'test@example.com' AND user.created_at > '2023-01-01'
```

To create OR conditions, nest them in a group:

```typescript
await Query(where => {
  const user = where(User);

  // This creates an OR group
  where(
    where(user.role).equal('admin'),
    where(user.role).equal('moderator')
  );

  return user;
});
// WHERE user.role = 'admin' OR user.role = 'moderator'
```

### Complex Conditions

Build complex logic using nested groups. Groups alternate between AND/OR based on nesting level:

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
SELECT post.*
FROM post
WHERE post.title = 'Hello'
   OR (post.published = true AND post.created_at > '2023-01-01')
```

### Advanced Grouping

```typescript
Query(where => {
  const item = where(Item);

  // Must be in stock
  where(item.inStock).equal(true);

  // AND (red OR blue)
  where(
    where(item.color).equal('red'),
    where(item.color).equal('blue')
  );

  // AND (small OR medium OR large)
  where(
    where(item.size).equal('small'),
    where(item.size).equal('medium'),
    where(item.size).equal('large')
  );

  return item;
});
```

```sql
WHERE item.in_stock = true
  AND (item.color = 'red' OR item.color = 'blue')
  AND (item.size = 'small' OR item.size = 'medium' OR item.size = 'large')
```

## Advanced Features

### Custom Column Names

Map JavaScript property names to different database column names:

```typescript
class User extends Table {
  firstName = Str({ column: 'first_name' });
  lastName = Str({ column: 'last_name' });
}

// Use JavaScript property names in your code
await User.insert({
  firstName: 'John',
  lastName: 'Doe'
});
```

### Custom Table Names

Customize the table name using the Primary factory:

```typescript
import { Primary } from '@expressive/sql';

class BlogPost extends Table {
  id = Primary({
    tableName: "legacy_blog_posts"
  });

  title = Str();
  content = Str();
}
```

### Data Validation

Fields automatically validate data based on their type and constraints:

```typescript
class Product extends Table {
  price = Num({ type: 'numeric', precision: 5, scale: 2 });
}

// This will throw a validation error
await Product.insert({ price: 1000.123 });
// Error: Value of `price` exceeds precision (5,2)
```

### Custom Getters and Setters

Transform data when reading from or writing to the database:

```typescript
import { hash } from './lib/passwords';

class User extends Table {
  // Hash password before storing
  password = Str({
    set: (value) => hash(value),
    get: (value) => value // Return as-is from DB
  });

  // Format data on read
  email = Str({
    get: (value) => value.toLowerCase()
  });
}

const user = await User.insert({
  password: 'plaintext123',  // Automatically hashed
  email: 'USER@EXAMPLE.COM'
});

console.log(user.email); // "user@example.com"
```

### Math Operations

Perform mathematical operations in queries using the function parameter:

```typescript
const query = Query((where, fn) => {
  const { add, sub, mul, div, neg } = fn;
  const item = where(Item);

  return {
    total: mul(item.price, item.quantity),
    discounted: mul(item.price, sub(1, item.discount)),
    taxed: add(item.price, mul(item.price, 0.1)),
    negated: neg(item.price)
  };
});
```

Nest expressions for complex calculations:

```typescript
Query((where, fn) => {
  const { add, mul } = fn;
  const item = where(Item);

  // (price + 5) * quantity
  return mul(add(item.price, 5), item.quantity);
});
// SELECT (item.price + 5) * item.quantity FROM item
```

Use template functions for custom SQL expressions:

```typescript
Query((where, fn) => {
  const item = where(Item);

  return {
    custom: fn(`${item.price} * (${item.quantity} + 5)`)
  };
});
// SELECT item.price * (item.quantity + 5) AS "custom"
```

### Inspecting Generated SQL

View the generated SQL by stringifying a query:

```typescript
const query = Query(where => {
  const user = where(User);
  const post = where(Post);

  where(post.authorId).equal(user.id);
  where(user.name).equal('John');
  where(post.published).equal(true);

  return {
    content: post.content,
    author: user.name
  };
});

console.log(String(query));
/*
  SELECT
    post.content AS "content",
    user.name AS "author"
  FROM post
  INNER JOIN user ON post.author_id = user.id
  WHERE user.name = 'John' AND post.published = true
*/

const results = await query; // Execute when ready
```

## More Features

The library includes additional capabilities:

- **Transactions** - Atomic operations across multiple queries
- **Connection pooling** - Efficient database connection management
- **Schema validation** - Automatic checking against database schema
- **Custom field types** - Extend base field types for specific needs
- **Query composition** - Build reusable query fragments

<br/><br/>

<h2 align="center"> 🚧 More Documentation Coming Soon! 🏗 </h2>
<p align="center">
  This documentation covers core features. Additional topics like<br/>
  transactions, migrations, schema management, and more are being documented!
</p>

<br/><br/>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
