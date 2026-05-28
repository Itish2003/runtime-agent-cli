import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { emit, ok } from "../envelope.ts";
import { findConfigPath } from "../config.ts";
import type { Config } from "../config.ts";
import { loadCatalog } from "../spec.ts";

interface Issue {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  detail?: string[];
}

const METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;

function scanMissingOpIds(rawPaths: any): string[] {
  const missing: string[] = [];
  for (const [path, item] of Object.entries<any>(rawPaths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (op && !op.operationId) missing.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return missing;
}

async function probeSource(source: string): Promise<{
  reachable: boolean;
  format: "json" | "yaml" | "unknown";
  error?: string;
  content_type?: string;
}> {
  if (/^https?:\/\//.test(source)) {
    try {
      const res = await fetch(source);
      if (!res.ok) return { reachable: false, format: "unknown", error: `HTTP ${res.status} from ${source}` };
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const looksYaml = /yaml/.test(ct) || /ya?ml$/.test(source);
      if (!looksYaml) {
        try {
          JSON.parse(text);
          return { reachable: true, format: "json", content_type: ct };
        } catch {
          // Falls through to yaml
        }
      }
      return { reachable: true, format: "yaml", content_type: ct };
    } catch (e) {
      return { reachable: false, format: "unknown", error: (e as Error).message };
    }
  }
  if (!existsSync(source)) return { reachable: false, format: "unknown", error: `File not found: ${source}` };
  const isYaml = /\.ya?ml$/i.test(source);
  return { reachable: true, format: isYaml ? "yaml" : "json" };
}

export async function doctor() {
  // Config probe — report clearly if absent rather than dying.
  const configPath = findConfigPath();
  if (!configPath) {
    emit(
      ok({
        config_found: false,
        issues: [
          {
            severity: "error",
            code: "NO_CONFIG",
            message: "No .runtime-agent-cli.yaml found. Run `runtime-agent-cli init` to scaffold one.",
          },
        ],
        verdict: "ERROR",
      }),
    );
    return;
  }

  // Inline config parsing — loadConfig() calls die() on errors, which would
  // bypass doctor's structured output. Do it manually so every path stays under
  // doctor's own control.
  let config: Config;
  let configDir: string;
  try {
    const text = readFileSync(configPath, "utf8");
    config = parseYaml(text) as Config;
  } catch (e) {
    emit(
      ok({
        config_found: true,
        config_path: configPath,
        issues: [{ severity: "error", code: "BAD_CONFIG", message: `Config could not be parsed: ${(e as Error).message}` }],
        verdict: "ERROR",
      }),
    );
    return;
  }

  if (!config?.openapi_source) {
    emit(
      ok({
        config_found: true,
        config_path: configPath,
        issues: [{ severity: "error", code: "BAD_CONFIG", message: "Config is missing required key 'openapi_source'." }],
        verdict: "ERROR",
      }),
    );
    return;
  }

  configDir = dirname(configPath);
  const src = config.openapi_source;
  const source = /^https?:\/\//.test(src) ? src : resolve(configDir, src);
  const probe = await probeSource(source);
  const issues: Issue[] = [];

  if (!probe.reachable) {
    issues.push({
      severity: "error",
      code: "SPEC_UNREACHABLE",
      message: `Cannot reach spec at ${source}`,
      detail: probe.error ? [probe.error] : undefined,
    });
    emit(
      ok({
        config_found: true,
        config_path: configPath,
        spec_source: source,
        reachable: false,
        issues,
        verdict: "ERROR",
      }),
    );
    return;
  }

  if (probe.format === "yaml") {
    issues.push({
      severity: "info",
      code: "SERVED_AS_YAML",
      message: "Spec is served/stored as YAML — this works but JSON is faster to parse.",
    });
  }

  // Try to load the catalog for deeper checks.
  let catalog: Awaited<ReturnType<typeof loadCatalog>> | null = null;
  let loadError: string | undefined;
  try {
    catalog = await loadCatalog(source);
  } catch (e) {
    loadError = (e as Error).message;
    issues.push({
      severity: "error",
      code: "SPEC_PARSE_FAILED",
      message: `Spec is reachable but could not be parsed: ${loadError}`,
    });
  }

  let specVersion: string | undefined;
  let opCount = 0;
  let missingOpIds: string[] = [];

  if (catalog) {
    const raw = catalog.raw;
    specVersion = raw.openapi ?? raw.swagger;
    opCount = catalog.operations.length;
    missingOpIds = scanMissingOpIds(raw.paths);

    if (!specVersion) {
      issues.push({
        severity: "warn",
        code: "NO_VERSION_FIELD",
        message: "Neither `openapi` nor `swagger` version field found in the spec.",
      });
    }

    if (opCount === 0) {
      issues.push({ severity: "warn", code: "NO_OPERATIONS", message: "Spec has no operations." });
    }

    if (missingOpIds.length > 0) {
      issues.push({
        severity: "warn",
        code: "MISSING_OPERATION_IDS",
        message: `${missingOpIds.length} operation(s) lack operationId and will use synthesized IDs — search/inspect/run may be surprising.`,
        detail: missingOpIds,
      });
    }
  }

  // Environment checks.
  const envNames = Object.keys(config.environments ?? {});
  const activeEnv = config.environment ?? (envNames.length === 1 ? envNames[0] : undefined);
  const activeEnvCfg = activeEnv ? config.environments?.[activeEnv] : undefined;
  const baseUrl = activeEnvCfg?.base_url ?? config.base_url;

  if (!baseUrl) {
    issues.push({
      severity: "warn",
      code: "NO_BASE_URL",
      message: "No base_url configured for the active environment — `run` and `conform` will fail.",
    });
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  const verdict = errorCount > 0 ? "ERROR" : warnCount > 0 ? "WARN" : "HEALTHY";

  emit(
    ok({
      config_found: true,
      config_path: configPath,
      spec_source: source,
      reachable: true,
      format: probe.format,
      ...(specVersion ? { openapi_version: specVersion } : {}),
      operations: catalog
        ? {
            total: opCount,
            missing_operation_id: missingOpIds.length,
            ...(missingOpIds.length ? { unnamed: missingOpIds } : {}),
          }
        : null,
      environment: {
        active: activeEnv ?? null,
        configured: envNames,
        base_url_present: Boolean(baseUrl),
      },
      issues,
      verdict,
    }),
  );
}
