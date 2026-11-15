---
"@expressive/sql": patch
---

The `expressive` bin is the shared command `@expressive/dev` also ships: whichever package links the bin runs both `expressive sql` and `expressive dev`, and lists the other as not installed when it is missing. `expressive sql` alone, or `expressive sql help`, prints help.
