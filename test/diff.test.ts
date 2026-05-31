import { test, expect } from "bun:test";
import { loadCatalog } from "../src/spec.ts";
import { diffResponse } from "../src/lib/diff.ts";

const fx = (name: string) => `${import.meta.dir}/fixtures/specs/${name}`;

// TS-01 — Reconcile two truths: an observed response matching the declared contract → PASS. (Tenet 3 / §7)
test("TS-01 response matching the declared schema → PASS", async () => {
  const cat = await loadCatalog(fx("clean-3.1.json"));
  const op = cat.byId.get("getUser")!;
  const res = diffResponse(200, { id: "u1", name: "Ada" }, op);
  expect(res.verdict).toBe("PASS");
  expect(res.mismatches).toHaveLength(0);
});

// TS-02 — A mismatch is surfaced as a bug, with a code + path. (Tenet 3)
test("TS-02 missing required field → FAIL with MISSING_REQUIRED_FIELD + path", async () => {
  const cat = await loadCatalog(fx("clean-3.1.json"));
  const op = cat.byId.get("getUser")!;
  const res = diffResponse(200, { name: "Ada" }, op); // omits required `id`
  expect(res.verdict).toBe("FAIL");
  const m = res.mismatches.find((x) => x.code === "MISSING_REQUIRED_FIELD");
  expect(m).toBeDefined();
  expect(m!.path).toBe("$.id");
});

// TS-03 — The checker never lies: a schema it had to truncate (recursive) cannot yield a
// false PASS — even with a structurally valid body. (diff.ts soundness, lines 216+)
test("TS-03 recursive schema → FAIL (truncation surfaced, never a false PASS)", async () => {
  const cat = await loadCatalog(fx("cyclic-3.1.json"));
  const op = cat.byId.get("getTree")!;
  const res = diffResponse(200, { value: "root", children: [] }, op);
  expect(res.verdict).toBe("FAIL");
  expect(res.mismatches.some((m) => /recursive/i.test(m.message))).toBe(true);
});

// TS-03b — A deep-but-acyclic schema (paginated envelope → items → nested anyOf
// settings, like list_jobs) is NOT recursive and must validate fully: a conforming
// body → PASS, never mislabeled "recursive". Regression guard for the depth-vs-cycle
// conflation (old MAX_SCHEMA_DEPTH=12 truncated this legitimate schema). (diff.ts)
test("TS-03b deep acyclic schema → PASS (not mistaken for recursion)", async () => {
  const cat = await loadCatalog(fx("deep-acyclic-3.1.json"));
  const op = cat.byId.get("listJobs")!;
  const body = {
    next_cursor: "abc",
    items: [
      {
        id: "j1",
        interview_settings: {
          offline_proctoring: {
            rules: { camera: { constraints: { resolution: { min: 480, max: 1080 } } } },
          },
        },
      },
    ],
  };
  const res = diffResponse(200, body, op);
  expect(res.verdict).toBe("PASS");
  expect(res.mismatches).toHaveLength(0);
  expect(res.mismatches.some((m) => /recursive|depth/i.test(m.message))).toBe(false);
});
