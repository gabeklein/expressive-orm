#!/usr/bin/env node
import { trunk } from '@expressive/cli/bin';

process.exitCode = await trunk("expressive")(process.argv.slice(2), console);
