#!/usr/bin/env node
import { dispatch } from './dispatch';

process.exitCode = await dispatch(process.argv.slice(2), process.cwd(), console);
