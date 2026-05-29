import { test, expect } from "bun:test";
import { loadCatalog } from "../src/spec.ts";

const fx = (name: string) => `${import.meta.dir}/fixtures/specs/${name}`;

// TS-05 — Parse leniently: one sparse/odd operation never discards the whole spec. (PRD §6)
test("TS-05 lenient parse: a sparse operation doesn't drop the well-formed ones", async () => {
  const cat = await loadCatalog(fx("partial-broken-3.1.json"));
  expect(cat.byId.has("goodOp")).toBe(true); // the complete op survives
  expect(cat.operations.length).toBe(2); // the sparse op is kept too (via synthId + {} defaults)
});

// TS-06 — Graceful degradation by quality: a low-quality spec (no operationIds) still yields
// usable operations via synthId, so inspect/run remain structurally available. (PRD line 131)
test("TS-06 low-quality spec: structural capability survives via synthId", async () => {
  const cat = await loadCatalog(fx("low-quality-3.0.json"));
  expect(cat.operations.length).toBe(2);
  for (const op of cat.operations) {
    expect(op.operationId).toMatch(/^(get|put|post|delete|patch|options|head|trace)_/);
  }
  // search relevance weakens (no summaries to match) but the catalog is intact — asserted
  // structurally here; the no-crash search behavior is covered black-box in cli.test.ts.
});

// TS-08 — Structurally cannot go stale: a spec edited between two reads is reflected,
// because the catalog is re-read on every call (no cache). (assessment line 20)
test("TS-08 re-read reflects a spec edited between invocations (no stale cache)", async () => {
  const spec = (ids: string[]) =>
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "tmp", version: "1.0.0" },
      paths: Object.fromEntries(
        ids.map((id) => [`/${id}`, { get: { operationId: id, responses: { "200": { description: "ok" } } } }]),
      ),
    });
  const p = `${import.meta.dir}/fixtures/.tmp-stale.json`;

  await Bun.write(p, spec(["alpha"]));
  expect((await loadCatalog(p)).byId.has("alpha")).toBe(true);

  await Bun.write(p, spec(["beta"])); // the live API changed under us
  const second = await loadCatalog(p);
  expect(second.byId.has("beta")).toBe(true); // fresh truth
  expect(second.byId.has("alpha")).toBe(false); // no stale cache — the competitive thesis

  await Bun.file(p).unlink();
});
