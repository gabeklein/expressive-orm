#!/usr/bin/env node
import { cmd, main } from '@expressive/cli';
import { Model } from '@expressive/mvc';

export { default } from './cli';

class Expressive extends Model {
  dev = cmd({
    peer: "@expressive/dev",
    help: "Run the app - Vite with HMR. `dev build` for production."
  });

  sql = cmd({
    lazy: () => import("./cli"),
    help: "Check or sync a database schema against your entities."
  });
}

main(import.meta, Expressive);
