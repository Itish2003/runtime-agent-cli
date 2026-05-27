import { loadConfig, resolveSpecSource, type LoadedConfig } from "../config.ts";
import { loadCatalog, type Catalog, type Operation } from "../spec.ts";
import { die } from "../envelope.ts";

export async function getCatalog(): Promise<{ loaded: LoadedConfig; catalog: Catalog }> {
  const loaded = loadConfig();
  const source = resolveSpecSource(loaded);
  try {
    const catalog = await loadCatalog(source);
    return { loaded, catalog };
  } catch (e) {
    die(
      "SPEC_LOAD_FAILED",
      `Could not load/parse the spec from ${source}: ${(e as Error).message}`,
      "Is the dev server running (for a URL source)? Check `openapi_source` in your config.",
    );
  }
}

export function requireOp(catalog: Catalog, id: string): Operation {
  const op = catalog.byId.get(id);
  if (op) return op;
  const near = [...catalog.byId.keys()]
    .filter((k) => k.toLowerCase().includes(id.toLowerCase()))
    .slice(0, 5);
  die(
    "OP_NOT_FOUND",
    `No operation '${id}' in this spec.`,
    near.length ? `Did you mean: ${near.join(", ")}?` : "Run `search <query>` to discover operations.",
  );
}
