#!/usr/bin/env bun
import { Command } from "commander";
import { die } from "./envelope.ts";
import { inspect } from "./commands/inspect.ts";
import { search } from "./commands/search.ts";
import { run } from "./commands/run.ts";
import { guide } from "./commands/guide.ts";
import { init } from "./commands/init.ts";

const program = new Command();

program
  .name("runtime-agent-cli")
  .description("A dev-time CLI that reflects your live API for AI coding agents. All output is JSON.")
  .version("0.0.1");

program
  .command("init")
  .description("Scaffold config + agent teaching files (AGENTS.md, skill stub, harness shims).")
  .action(() => init());

program
  .command("guide")
  .description("Print the doctrine + workflow, tailored to the current spec. Agents: read this first.")
  .action(() => guide());

program
  .command("search [query]")
  .description("Find operations by keyword (operationId / path / summary / tags).")
  .option("-l, --limit <n>", "max results", "10")
  .action((query, opts) => search(query, opts));

program
  .command("inspect <operationId>")
  .description("Resolved schema + a ready-to-fill `run` payload for one operation.")
  .option("-d, --detail <level>", "brief | detailed | full", "detailed")
  .action((op, opts) => inspect(op, opts));

program
  .command("run <operationId>")
  .description("Execute an operation; observe the real response. JSON in, JSON out.")
  .option("-i, --input <file>", "JSON file with { path, query, body, headers }")
  .option("-b, --batch <file>", "JSON array of inputs — fire all in one shot")
  .option("-e, --env <name>", "environment to target")
  .option("--dry-run", "print the fully-resolved request (secrets redacted), send nothing")
  .option("--allow-writes", "permit non-GET/HEAD (write/destructive) calls")
  .action((op, opts) => run(op, opts));

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    die("UNCAUGHT", (e as Error).message ?? String(e));
  }
}

main();
