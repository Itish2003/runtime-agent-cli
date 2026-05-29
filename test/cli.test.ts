import { test, expect } from "bun:test";

const CLI = `${import.meta.dir}/../src/cli.ts`;
const PROJECT = `${import.meta.dir}/fixtures/project`;

async function rac(args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], { cwd: PROJECT, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { json: JSON.parse(out), code };
}

// TS-10 — §7: every command emits exactly one valid JSON envelope; success carries ok:true.
test("TS-10 search emits a single valid ok:true envelope", async () => {
  const { json } = await rac(["search"]);
  expect(json.ok).toBe(true);
  expect(typeof json.total_operations).toBe("number");
  expect(Array.isArray(json.results)).toBe(true);
});

// TS-11 — §6b mechanism 2: a wrong call returns the doctrine + correct shape (a hint), not just an error.
test("TS-11 unknown operation → ok:false with error + a teaching hint", async () => {
  const { json } = await rac(["inspect", "doesNotExist"]);
  expect(json.ok).toBe(false);
  expect(json.error).toBe("OP_NOT_FOUND");
  expect(json.message).toBeTruthy();
  expect(json.hint).toBeTruthy();
});

// TS-12 — Safety default (§8): non-GET/HEAD blocked without --allow-writes; exit code 1; hint present.
test("TS-12 write op without --allow-writes → WRITE_BLOCKED envelope + exit 1", async () => {
  const { json, code } = await rac(["run", "createUser"]);
  expect(json.ok).toBe(false);
  expect(json.error).toBe("WRITE_BLOCKED");
  expect(json.hint).toBeTruthy();
  expect(code).toBe(1);
});
