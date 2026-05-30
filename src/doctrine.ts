// The doctrine is the product. Shipped to agents via `guide`, and reused as
// pedagogical hints in error envelopes. Keep it in one place.

// Lead with the WHY: the failure mode this tool exists to break.
export const WHY =
  "A coding agent writes the backend and the tests from the same assumptions — and with a " +
  "sparse prompt it invents the gaps and never gets an outside signal. So it is confidently " +
  "wrong: the test passes because it encodes the same belief as the code. This tool is the " +
  "missing external feedback — it makes the running server, not your assumptions, the thing " +
  "you check against.";

export const TENETS = [
  "The running server is the fact; the source is a hypothesis. Verify against what runs.",
  "Observe before you assert. You are biased toward the code you just wrote — a test from that same belief proves nothing. Hit the endpoint and encode what it *does*.",
  "Reconcile the two truths. Run `conform` to diff what the server returns against what the spec declares. A mismatch is a bug to fix in the server or the spec — not a behavior to freeze into a passing test.",
  "Stress, don't confirm. The happy path is the least informative input. Probe missing fields, wrong types, boundaries, missing auth.",
  "Safe by default. Name your environment; read-only until told otherwise; dry-run destructive verbs.",
];

// SECONDARY — the workflow around the loop. Principle first; named tools are current
// best-in-class instances ("e.g."), not requirements, so the doctrine outlives them.
export const PARTNERS = [
  "Build the client from the spec — don't hand-write it. Once an endpoint is verified, hand-writing fetch calls re-introduces the bias this tool removes. Feed the *same spec* to a deterministic generator (e.g. hey-api): it consumes the contract, this tool verifies it. One source of truth, two jobs.",
  "Expose to third parties through a transport, not your prompt. To let other agents use your API, put it behind an MCP/CodeMode surface (e.g. fastmcp): dynamic discovery lets clients find capabilities at runtime against the always-fresh spec, and OAuth comes from the transport — not hand-rolled. The spec stays the contract; the transport is just a projection of it.",
];

export const WORKFLOW = [
  "doctor                          — verify the spec is reachable, check its version and operationId coverage. Fix issues here before going further.",
  "search <query>                  — find the operation (don't read the whole spec).",
  "inspect <op>                    — get its resolved schema + a ready-to-fill `run` template. Don't hand-build the call.",
  "run <op> --input payload.json [--dry-run]  — execute; observe the real response.",
  "run <op> --batch inputs.json    — probe many inputs in one shot (stress, don't confirm).",
  "conform <op> --input payload.json          — diff observed response against the declared contract; mismatches are bugs.",
  "conform <op> --batch inputs.json           — conform many inputs; any FAIL exits non-zero.",
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
    "A mismatch from `conform` means the server response diverges from the spec — fix the server OR the spec, not the test. " +
    "Mismatch codes: MISSING_REQUIRED_FIELD (field absent), TYPE_MISMATCH (wrong type), EXTRA_FIELD (undeclared field with additionalProperties:false), " +
    "UNDECLARED_STATUS (response status not in spec), SCHEMA_VIOLATION (constraint failed or recursive schema truncated). " +
    "Run `inspect <operationId>` to compare the declared schema.",
};
