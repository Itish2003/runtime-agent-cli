import { emit, ok } from "../envelope.ts";
import { WHY, TENETS, WORKFLOW, PARTNERS } from "../doctrine.ts";
import { loadConfig, resolveSpecSource } from "../config.ts";
import { loadCatalog } from "../spec.ts";

// Served live by the CLI so it always matches the installed version AND the
// current spec (repo-aware). The skill stub just points here.
export async function guide() {
  let api: object | null = null;
  try {
    const loaded = loadConfig();
    const catalog = await loadCatalog(resolveSpecSource(loaded));
    const tags = [...new Set(catalog.operations.flatMap((o) => o.tags))].sort();
    api = {
      operations: catalog.operations.length,
      tags: tags.length ? tags : ["(untagged)"],
      example: catalog.operations[0]?.operationId ?? null,
    };
  } catch {
    api = null; // spec unreachable — still ship the doctrine
  }

  emit(
    ok({
      why: WHY,
      what: "A dev-time CLI that reflects your live API. Verify what the server actually does, not what the code assumes.",
      doctrine: TENETS,
      workflow: WORKFLOW,
      partners: PARTNERS,
      api,
      note: api
        ? "Start with `search <query>`, then `inspect <operationId>`, then `run`."
        : "Spec not reachable yet — start your dev server, or check `openapi_source` in the config.",
    }),
  );
}
