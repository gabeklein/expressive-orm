#!/usr/bin/env node
import { main } from '@expressive/cli';

import Sql from './cli';

export default main(import.meta, Sql, { as: "expressive" });
