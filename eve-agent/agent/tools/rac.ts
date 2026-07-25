import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { defineTool } from "eve/tools";
import { z } from "zod";

const exec = promisify(execFile);

// The demo modality for this project (portfolio notes/projects.md): the
// agent runs the REAL CLI and shows the actual deterministic JSON. Not a
// mock, not a transcript — the tool doing the thing.
//
// Safety: this tool can never pass --allow-writes. `rac run` on a write verb
// returns WRITE_BLOCKED — which is not a failure, it IS the product's
// enforced read-only default, demonstrated live.

// `eve dev` runs from eve-agent/, so the CLI source is one level up.
const CLI_REPO = process.env.RAC_REPO_DIR ?? path.resolve(process.cwd(), "..");
// Working dir supplies .runtime-agent-cli.yaml — the fable-2.0 pairing
// (one project verifying another) is already wired in that repo.
const TARGET_DIR =
  process.env.RAC_TARGET_DIR ?? path.join(homedir(), "Downloads", "fable2.0");

export default defineTool({
  description:
    "Run the real runtime-agent-cli against its configured target API (fable-2.0's live FastAPI, another of Itish's projects) and return the CLI's actual JSON output. Actions: 'search' finds operations by keyword; 'inspect' resolves one operation's schema plus a ready example payload; 'run' executes an operation (read-only — write verbs return WRITE_BLOCKED by design, which is the enforced-safety demo); 'doctor' reports spec health; 'conform' diffs a live response against the declared contract. Use this whenever a visitor wants to see the tool actually work.",
  inputSchema: z.object({
    action: z.enum(["search", "inspect", "run", "doctor", "conform"]),
    query: z
      .string()
      .optional()
      .describe("Keyword for 'search' (e.g. 'story')."),
    operationId: z
      .string()
      .optional()
      .describe("Required for 'inspect', 'run', and 'conform'."),
    dryRun: z
      .boolean()
      .optional()
      .describe(
        "For 'run': print the fully-resolved request (secrets redacted) without sending it.",
      ),
  }),
  async execute({ action, query, operationId, dryRun }) {
    const args: string[] = [path.join(CLI_REPO, "src", "cli.ts"), action];
    if (action === "search" && query) args.push(query);
    if (action === "inspect" || action === "run" || action === "conform") {
      if (!operationId) {
        return { ok: false, error: `${action} requires an operationId` };
      }
      args.push(operationId);
    }
    if (action === "run" && dryRun) args.push("--dry-run");
    // Deliberately no --allow-writes, ever.

    try {
      const { stdout } = await exec("node", args, {
        cwd: TARGET_DIR,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (e) {
      // The CLI prints deterministic JSON even on error paths.
      const err = e as { stdout?: string; message?: string };
      if (err.stdout) {
        try {
          return JSON.parse(err.stdout);
        } catch {
          /* fall through */
        }
      }
      return { ok: false, error: err.message?.slice(0, 300) ?? "cli failed" };
    }
  },
});
