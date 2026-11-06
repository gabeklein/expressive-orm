---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**A relation's column is named after its property.** `author = one(User)` stores `author_id`, not `user_id`; relations named after their class keep their column. Two fields on one column throw when the class is first used. On a table still holding the old column, sync reports the relation instead of adding an empty one: add `{ column: "user_id" }` to keep it.
