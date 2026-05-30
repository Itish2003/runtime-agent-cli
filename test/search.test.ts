import { test, expect } from "bun:test";
import { loadCatalog } from "../src/spec.ts";
import { rankOperations } from "../src/commands/search.ts";
import type { Operation } from "../src/spec.ts";

const fx = `${import.meta.dir}/fixtures/specs/large-3.1.json`;
const ids = (ops: Operation[]) => ops.map((o) => o.operationId);

// TS-15 — Relevance: a specific multi-term query ranks the obvious operation first.
test("TS-15 'create user' ranks createUser #1 (all-terms + operationId bonus)", async () => {
  const { operations } = await loadCatalog(fx);
  const ranked = rankOperations(operations, "create user");
  expect(ranked[0].operationId).toBe("createUser"); // only op matching BOTH terms in its id
});

// TS-16 — Determinism: ranking is independent of catalog/input order. The old scorer
// sorted on score alone, so ties resolved by input order — this guards that defect.
test("TS-16 ranking is input-order-independent (total-order tie-break)", async () => {
  const { operations } = await loadCatalog(fx);
  const forward = ids(rankOperations(operations, "user")); // 'user' is intentionally ambiguous
  const reversed = ids(rankOperations([...operations].reverse(), "user"));
  expect(forward.length).toBeGreaterThan(1); // ties genuinely exist
  expect(reversed).toEqual(forward); // identical order despite reversed input
  expect(new Set(forward).size).toBe(forward.length); // a real total order — no dupes
});

// TS-17 — The `description` field is now searched (it was stored but ignored before).
test("TS-17 'tenant' (only in a description) matches listInvoices", async () => {
  const { operations } = await loadCatalog(fx);
  expect(ids(rankOperations(operations, "tenant"))).toContain("listInvoices");
});

// TS-18 — Tokenization: camelCase split + path segments make 'profile' resolve.
test("TS-18 'profile' resolves updateUserProfile (camelCase + path tokens)", async () => {
  const { operations } = await loadCatalog(fx);
  expect(rankOperations(operations, "profile")[0].operationId).toBe("updateUserProfile");
});
