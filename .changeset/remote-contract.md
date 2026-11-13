---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

`Remote` requests carry a format version, `v: 1`, and `Remote.handle` refuses with a `Remote.Error` whose `code` says why: `version`, `malformed`, `unknown`, `invalid` or `failed`. Failures past validation still read `Request failed.`, with the original as `cause`; errors thrown by `check` pass through.

**Breaking:** a server on this version refuses requests without `v` - those from a 0.20 `Remote` client - with code `version`. Update client and server together.
