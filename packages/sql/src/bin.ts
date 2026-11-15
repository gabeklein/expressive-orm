#!/usr/bin/env node
import { cmd, main } from '@expressive/cli';
import { Model } from '@expressive/mvc';

export { default } from './cli';

class Expressive extends Model {
  dev = cmd({ peer: "@expressive/dev", help: "Vite dev server with HMR; dev build for production" });
  sql = cmd({ peer: "@expressive/sql", help: "check and sync your database schema" });
}

main(import.meta, Expressive);
