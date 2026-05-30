#!/usr/bin/env bun

import { runReefCli } from "../src/core/cli";

try {
  await runReefCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
