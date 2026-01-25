

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
  Define classes to power your queries by extending <code>Table</code> or <code>Type</code>.<br/>
  The <code>Query</code> factory helps you compose one-to-one SQL and execute them.<br/>
  Columns you return are selected and ready for type-safe use!<br/>
</p>

<br/>

> [!NOTE]
> Library is experimental and documentation is in progress.
> Current README is geared as a tech demo to show what I'm working on! :)


<br/>
<h1 id="overview-section">Overview</h1>

Classes which extend `Table` or `Type` can manage your data with high safety and convenience. This project aims to make using SQL in Javascript apps completely frictionless.

<br/>

## Benefits over other ORMs

- **No DSL or magic** - Everything is plain JavaScript/TypeScript
- **Type safety without decorators** - Full type inference without complex setup
- **Declarative and SQL-first** - The API closely follows SQL semantics - No chaining! ⛓️‍💥
- **Context agnostic** - The query system handles database syntax specifics for you.
- **Uber Extensible** - Fields and Tables can be extended and customized to fit most needs.
- **Performance** - Very minimal overhead over actual SQL clients, memory efficient at high volume.

<br/>

## Quick Start

```bash
npm i @expressive/orm @expressive/postgres pg
```

```typescript
import { Type, str, num, bool, date, notNull } from '@expressive/orm';
import { PGConnection } from '@expressive/postgres';

// Define your models
class User extends Type {
  static table = "users";

  name = str(notNull);
  email = str(notNull);
  age = num();
  active = bool(notNull);
  createdAt = date(notNull);
}

// Connect to your database
await new PGConnection({ User }, {
  host: 'localhost',
  database: 'myapp'
});

// Create records
const user = await User.new({
  name: 'Alice',
  email: 'alice@example.com',
  active: true,
  createdAt: new Date()
});

// Query records
const alice = await User.one({ email: 'alice@example.com' });
console.log(alice.name); // "Alice"
```

<br/>

## Packages

Expressive ORM is composed of multiple packages that can be used together or separately:

### @expressive/orm (Recommended)

The high-level ORM package with ActiveRecord-style models. Use this if you want:
- Simple model definitions with `Type` class
- Instance methods and automatic caching
- Convenient field factories (`str()`, `num()`, `bool()`, etc.)
- Built-in relations (`one()`, `get()`)

```bash
npm i @expressive/orm
```

### @expressive/sql

The low-level SQL query builder. Use this if you want:
- More control over schema definitions
- Custom field behaviors with `Str()`, `Num()`, `Bool()`, etc.
- Direct SQL generation without ORM overhead
- To build your own ORM layer

```bash
npm i @expressive/sql
```

### Database Adapters

Pick an adapter for your database:

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

<br/>

## Define your schema

### Using @expressive/orm (Recommended)

With the ORM package, you get a clean, high-level API for defining models:

```typescript
import { Type, str, num, bool, date, json, uuid, notNull, optional } from '@expressive/orm';

class User extends Type {
  static table = "users";

  // Fields are nullable by default
  name = str();              // string | undefined
  nickname = str();          // string | undefined

  // Use notNull for required fields
  email = str(notNull);      // string
  password = str(notNull);   // string

  // Numbers with automatic parsing
  age = num();               // number | undefined
  balance = num(notNull);    // number

  // Booleans with 1/0 conversion
  active = bool(notNull);    // boolean
  verified = bool();         // boolean | undefined

  // Dates with ISO string conversion
  createdAt = date(notNull); // Date
  lastLogin = date();        // Date | undefined

  // JSON fields with auto parse/stringify
  metadata = json<{ theme: string }>();                    // { theme: string } | undefined
  settings = json<{ notifications: boolean }>(notNull);    // { notifications: boolean }

  // UUID fields
  externalId = uuid();       // string | undefined
}
```

**Type inference is automatic!** Fields default to nullable and you use `notNull` to make them required.

### Using @expressive/sql

With the SQL package, you have more control over column definitions:

```typescript
import { Table, Str, Num, Bool, Time, Primary } from '@expressive/sql';

class User extends Table {
  // Fields default to nullable
  name = Str();
  nickname = Str();

  // Use nullable: false in options for required fields
  email = Str({ nullable: false, unique: true });
  password = Str({ nullable: false, type: "varchar", length: 40 });

  // Custom types and precision
  age = Num({ type: "smallint" });
  balance = Num({ type: "numeric", precision: 10, scale: 2, nullable: false });

  // Boolean fields
  active = Bool({ nullable: false });

  // Time fields with defaults
  createdAt = Time({ nullable: false, fallback: "NOW" });
  updatedAt = Time();

  // Custom primary key
  id = Primary({ tableName: "users" });
}
```

### Field Options

Both packages support extensive field customization:

```typescript
// Custom column name
firstName = str({ column: 'first_name' }, notNull);

// Default values
status = str({ fallback: 'pending' });
createdAt = date({ fallback: 'NOW' });

// Unique constraints
email = str({ unique: true }, notNull);

// Custom getters/setters
password = str({
  set: (value) => hashPassword(value),
  get: (value) => value // returned as-is from DB
}, notNull);
```

<br/>

## Connecting to your database

Pick an adapter and connect your models:

```typescript
// PostgreSQL
import { PGConnection } from '@expressive/postgres';
import * as models from './models';

await new PGConnection(models, {
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// PGLite (embedded)
import { PGLiteConnection } from '@expressive/postgres';
await new PGLiteConnection(models, { dataDir: './data' });

// SQLite
import { SQLiteConnection } from '@expressive/sqlite';
await new SQLiteConnection(models, './database.db');

// MySQL
import { MySQLConnection } from '@expressive/mysql';
await new MySQLConnection(models, {
  host: 'localhost',
  database: 'myapp',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
```

When you connect, all Table/Type classes are validated against the database schema. If any mismatch is found, the connection will throw - ensuring you operate on the data you expect.

<br/>

## Creating Records

### Using Type.new()

```typescript
// Create a single record
const user = await User.new({
  name: 'John Doe',
  email: 'john@example.com',
  active: true,
  createdAt: new Date()
});

console.log(user.id); // Auto-generated ID
console.log(user.name); // "John Doe"
```

### Using Table.insert()

```typescript
// Insert and get the ID
const userId = await User.insert({
  name: 'John Doe',
  email: 'john@example.com'
});
```

<br/>

## Reading Records

### Fetch by ID

```typescript
// Fetch by ID
const user = await User.one(1);

// Fetch latest record
const latest = await User.one();

// Fetch with sorting
const oldest = await User.one({ id: asc() });
```

### Fetch by Criteria

```typescript
// Find by field value
const alice = await User.one({ email: 'alice@example.com' });

// Combine criteria with sorting
const user = await User.one({
  active: true,
  createdAt: [desc(), greaterThan(new Date('2024-01-01'))]
});
```

### Optional vs Required

```typescript
// Throws if not found
const user = await User.one({ email: 'notfound@example.com' });
// Error: No record found

// Returns undefined if not found
const user = await User.one({ email: 'notfound@example.com' }, false);
console.log(user); // undefined
```

### Force Reload

Instances are cached by ID. To force a fresh fetch from the database:

```typescript
const user = await User.one(1);        // Fetches from DB
const same = await User.one(1);        // Returns cached instance
const fresh = await User.one(1, true); // Forces DB fetch

console.log(user === same);   // true
console.log(user === fresh);  // false
console.log(user.name === fresh.name); // true (same data)
```

<br/>

## Updating Records

### Instance Updates

```typescript
const user = await User.one(1);

await user.update({
  name: 'Jane Doe',
  lastLogin: new Date()
});

console.log(user.name); // "Jane Doe" (instance is updated)
```

### Query-Based Updates

The `Query` function can also update multiple records:

```typescript
const count = await Query(where => {
  const user = where(User);

  where(user.active).equal(true);
  where(user.lastLogin).under(new Date('2024-01-01'));

  where(user).update({
    active: false
  });
});

console.log(`Deactivated ${count} users`);
```

### Updates with Joins

```typescript
await Query(where => {
  const post = where(Post);
  const user = where(User);

  where(post.userId).equal(user.id);
  where(user.email).equal("john@example.com");

  where(post).update({
    published: false
  });
});
```

<br/>

## Deleting Records

```typescript
const user = await User.one({ email: 'delete-me@example.com' });
await user.delete();
```

<br/>

## Querying your data

The `Query` function is a powerful factory which generates both the SQL query and the parser for results.

### Basic Queries

```typescript
import { Query } from '@expressive/sql'; // or from '@expressive/orm'

// Return specific fields as an object
const results = await Query(where => {
  const user = where(User);

  where(user.active).equal(true);

  return {
    name: user.name,
    email: user.email
  };
});

// Type: Array<{ name: string | undefined; email: string }>
```

### Return Entire Entities

```typescript
// Return full entity
const users = await Query(where => {
  const user = where(User);

  where(user.active).equal(true);

  return user;
});

// Type: Array<User>
// Each result is a full User instance with all fields
```

### Return Single Fields

```typescript
// Return just one field
const emails = await Query(where => {
  const user = where(User);

  return user.email;
});

// Type: Array<string>
```

### Return Nested Objects

```typescript
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

// Type: Array<{ user: { id: number; name: string | undefined }; contact: { email: string } }>
// SQL aliases: "user.id", "user.name", "contact.email"
```

### Queries Without Tables

```typescript
// Return constants
const result = await Query(() => {
  return {
    greeting: "Hello",
    count: 42,
    now: new Date()
  };
});

// Generates: SELECT 'Hello' AS "greeting", 42 AS "count", ...
```

### COUNT Queries

```typescript
// Default behavior with no return value
const count = await Query(where => {
  const user = where(User);

  where(user.active).equal(true);
  // No return statement = COUNT(*)
});

// count is a number
```

<br/>

## WHERE Clauses

### Comparison Operators

```typescript
await Query(where => {
  const user = where(User);

  // Equal
  where(user.name).equal('Alice');

  // Not equal
  where(user.status).not('deleted');

  // Greater than
  where(user.age).over(18);

  // Greater than or equal
  where(user.age).over(18, true);

  // Less than
  where(user.age).under(65);

  // Less than or equal
  where(user.age).under(65, true);

  // IN operator
  where(user.status).in(['active', 'pending']);

  return user;
});
```

### Grouping Conditions

By default, multiple conditions are combined with AND:

```typescript
await Query(where => {
  const user = where(User);

  // These are ANDed together
  where(user.active).equal(true);
  where(user.age).over(18);

  return user;
});

// WHERE user.active = true AND user.age > 18
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

### Complex Grouping

```typescript
await Query(where => {
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

// WHERE item.in_stock = true
//   AND (item.color = 'red' OR item.color = 'blue')
//   AND (item.size = 'small' OR item.size = 'medium' OR item.size = 'large')
```

### Nested Grouping

Groups can be nested to create complex logic:

```typescript
await Query(where => {
  const item = where(Item);

  where(
    where(
      where(item.color).equal('red'),
      where(item.size).equal('small')
    ),
    where(
      where(item.color).equal('blue'),
      where(
        where(item.size).equal('medium'),
        where(item.size).equal('large')
      )
    )
  );

  return item;
});

// WHERE (item.color = 'red' AND item.size = 'small')
//    OR (item.color = 'blue' AND (item.size = 'medium' OR item.size = 'large'))
```

<br/>

## Sorting & Limits

### Sorting

```typescript
await Query(where => {
  const user = where(User);

  // Sort by one field
  where(user.createdAt).desc();

  return user.name;
});

// ORDER BY user.created_at DESC
```

### Multiple Column Sorting

```typescript
await Query(where => {
  const user = where(User);

  where(user.active).desc();  // Active users first
  where(user.name).asc();     // Then alphabetically

  return user;
});

// ORDER BY user.active DESC, user.name ASC
```

### Limits

```typescript
await Query(where => {
  const user = where(User);

  where(user.active).equal(true);
  where(10); // LIMIT 10

  return user;
});
```

<br/>

## Joins

Joins are created by comparing fields from different tables:

```typescript
await Query(where => {
  const post = where(Post);
  const user = where(User);

  // This creates a JOIN
  where(post.userId).equal(user.id);

  // Additional WHERE clauses
  where(post.published).equal(true);
  where(user.active).equal(true);

  return {
    title: post.title,
    content: post.content,
    author: user.name
  };
});

// SELECT post.title AS "title", post.content AS "content", user.name AS "author"
// FROM post
// INNER JOIN user ON post.user_id = user.id
// WHERE post.published = true AND user.active = true
```

<br/>

## Math Operations

The Query function provides math operations through the second parameter:

```typescript
await Query((where, fn) => {
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

### Nested Math Expressions

```typescript
await Query((where, fn) => {
  const { add, mul } = fn;
  const item = where(Item);

  // (price + 5) * quantity
  return mul(add(item.price, 5), item.quantity);
});

// SELECT (item.price + 5) * item.quantity FROM item
```

### Template Functions

For custom SQL expressions, use template strings:

```typescript
await Query((where, fn) => {
  const item = where(Item);

  return {
    custom: fn(`${item.price} * (${item.quantity} + 5)`)
  };
});

// SELECT item.price * (item.quantity + 5) AS "custom"
```

<br/>

## Working with Relations

### One-to-One Relations

Define relations using the `one()` function:

```typescript
import { Type, str, one, notNull } from '@expressive/orm';

class Profile extends Type {
  static table = "profiles";

  bio = str(notNull);

  // Relations default to nullable
  user = one(User);      // User | undefined
}

class Article extends Type {
  static table = "articles";

  title = str(notNull);

  // Use notNull for required relations
  author = one(User, notNull);  // User
}
```

### Inserting with Relations

```typescript
// Insert by ID
const profile = await Profile.new({
  bio: 'Software developer',
  user: 1  // User ID
});

// Insert by instance
const user = await User.one(1);
const profile = await Profile.new({
  bio: 'Software developer',
  user: user  // User instance
});

// Insert nested (creates both records)
const article = await Article.new({
  title: 'Hello World',
  author: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

console.log(article.author.name); // "John Doe"
console.log(article.author.id);   // Auto-generated
```

### Querying with Relations

```typescript
// Find by relation ID
const article = await Article.one({ author: 1 });

// Find by relation instance
const user = await User.one(1);
const article = await Article.one({ author: user });

// Find by nested criteria
const article = await Article.one({
  author: { email: 'john@example.com' }
});

console.log(article.author.name); // "John Doe"
```

### Updating Relations

```typescript
const article = await Article.one(1);

// Update relation by ID
await article.update({ author: 2 });

// Update relation by nested object (updates the related user)
await article.update({
  author: { name: 'Jane Doe' }
});
```

### Inverse Relations (One-to-Many)

Use `get()` to define inverse relationships:

```typescript
import { Type, str, one, get, notNull } from '@expressive/orm';

class User extends Type {
  static table = "users";

  name = str(notNull);

  // Inverse relation - automatically infers the foreign key
  articles = get(Article);  // Looks for Article.user
}

class Article extends Type {
  static table = "articles";

  title = str(notNull);
  user = one(User, notNull);
}

// Query inverse relations
const user = await User.one(1);
const articles = await user.articles.get();

console.log(articles.length);      // Number of articles
console.log(articles[0].title);    // Article title
```

### Lazy Loading

By default, relations are eager-loaded. Use `lazy` for deferred loading:

```typescript
import { one, lazy } from '@expressive/orm';

class Article extends Type {
  static table = "articles";

  title = str(notNull);
  author = one(User, { lazy: true });
}

const article = await Article.one(1);

// Accessing lazy field throws a Promise
try {
  console.log(article.author.name);
} catch (promise) {
  const author = await promise;
  console.log(author.name);
}
```

<br/>

## Advanced Features

### Custom Instance Methods

Add methods to your model classes:

```typescript
class User extends Type {
  static table = "users";

  name = str(notNull);
  email = str(notNull);

  greet() {
    return `Hello, ${this.name}!`;
  }

  async sendEmail(subject: string, body: string) {
    // Send email logic
    await emailService.send(this.email, subject, body);
  }
}

const user = await User.one(1);
console.log(user.greet()); // "Hello, Alice!"
await user.sendEmail('Welcome', 'Thanks for signing up!');
```

### Static Factory Methods

```typescript
class User extends Type {
  static table = "users";

  name = str(notNull);
  email = str(notNull);
  active = bool(notNull);

  static async createActive(name: string, email: string) {
    return this.new({
      name,
      email,
      active: true
    });
  }
}

const user = await User.createActive('Bob', 'bob@example.com');
console.log(user.active); // true
```

### Extending Models

```typescript
class User extends Type {
  static table = "users";

  name = str(notNull);
}

class AdminUser extends User {
  static from(name: string) {
    return this.new({ name });
  }

  displayName() {
    return `Admin: ${this.name}`;
  }
}

const admin = await AdminUser.from('Charlie');
console.log(admin.displayName()); // "Admin: Charlie"
```

### Instance Caching

Instances are automatically cached by ID to prevent duplicate objects:

```typescript
const user1 = await User.one(1);
const user2 = await User.one(1);

console.log(user1 === user2); // true - same instance

// Modify one
user1.name = 'Modified';
console.log(user2.name); // "Modified" - same object

// Force reload from database
const fresh = await User.one(1, true);
console.log(fresh === user1); // false - new instance
```

### Data Validation

Fields automatically validate data based on their type and constraints:

```typescript
class Product extends Type {
  static table = "products";

  price = num({ type: 'numeric', precision: 5, scale: 2 }, notNull);
}

// This will throw a validation error
await Product.new({ price: 1000.123 });
// Error: Value of `price` exceeds precision (5,2)
```

### Custom Column Names

```typescript
class User extends Type {
  static table = "users";

  firstName = str({ column: 'first_name' }, notNull);
  lastName = str({ column: 'last_name' }, notNull);
}

// Use JavaScript property names, not column names
const user = await User.new({
  firstName: 'John',
  lastName: 'Doe'
});
```

### Custom Table Names

```typescript
class BlogPost extends Type {
  static table = "legacy_blog_posts";

  title = str(notNull);
  content = str(notNull);
}
```

<br/>

## Inspecting Generated SQL

You can view the generated SQL by stringifying a query:

```typescript
const query = Query(where => {
  const user = where(User);
  const post = where(Post);

  where(post.userId).equal(user.id);
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
  FROM
    post
    INNER JOIN user ON post.user_id = user.id
  WHERE
    user.name = 'John'
    AND post.published = true
*/

const results = await query; // Execute when ready
```

<br/><br/>

<h2 align="center"> 🚧 More Features Coming Soon! 🏗 </h2>
<p align="center">
  This documentation covers the core features. Additional capabilities like <br/>
  transactions, migrations, connection pooling, and more are in development!
</p>

<br/><br/>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
