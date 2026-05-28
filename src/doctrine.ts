// The doctrine is the product. Shipped to agents via `guide`, and reused as
// pedagogical hints in error envelopes. Keep it in one place.

export const TENETS = [
  "The running server is the fact; the source is a hypothesis. Verify against what runs.",
  "Observe before you assert. Never write a test from what the code *should* return — hit the endpoint, encode what it *does*.",
  "Reconcile the two truths. Check observed behavior against the declared contract. Mismatch = a bug to surface, not a behavior to freeze into a passing test.",
  "Stress, don't confirm. The happy path is the least informative input. Probe missing fields, wrong types, boundaries, missing auth.",
  "Safe by default. Name your environment; read-only until told otherwise; dry-run destructive verbs.",
];

export const WORKFLOW = [
  "doctor           — check spec health first (version, reachability, missing operationIds).",
  "search <query>   — find the operation (don't read the whole spec).",
  "inspect <op>     — get its resolved schema + a ready-to-fill `run` template. Don't hand-build the call.",
  "run <op> --input payload.json [--dry-run]  — execute; observe the real response.",
  "run <op> --batch inputs.json — probe many inputs in one shot (stress, don't confirm).",
  "conform <op> --input payload.json — diff observed response against the declared contract; mismatches = bugs.",
];

export const HINTS = {
  writeInput:
    "Write the payload to a file and pass `--input payload.json` (or pipe via stdin). " +
    "Inline nested JSON breaks under shell escaping — the tool resolves the call for you; you supply the values.",
  useInspect:
    "Run `inspect <operationId>` first — it returns the exact param locations and a ready-to-fill payload. Don't guess the shape.",
  nameEnv:
    "Name an environment (config `environment:` or `--env <name>`). The tool refuses to fire at an unnamed target — it won't guess which backend you mean.",
  readOnly:
    "Doctrine: safe by default. This is a write/destructive verb; re-run with `--allow-writes` once you're sure of the target environment.",
  runDoctor:
    "Run `doctor` first — it checks spec reachability, version, and operationId coverage so you know what the tool can reliably address.",
  conformMismatch:
    "A mismatch from `conform` means the server response diverges from the spec — fix the spec OR the server, not the test. " +
    "Use `inspect <operationId>` to see the declared schema for comparison.",
};
