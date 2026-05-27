import { parse } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { die } from "./envelope.ts";
import { HINTS } from "./doctrine.ts";

export const CONFIG_NAME = ".runtime-agent-cli.yaml";

export interface EnvConfig {
  base_url?: string;
  headers?: Record<string, string>;
}

export interface Config {
  openapi_source: string;
  base_url?: string;
  environment?: string;
  environments?: Record<string, EnvConfig>;
}

export interface LoadedConfig {
  config: Config;
  dir: string; // directory the config lives in (for resolving relative spec paths)
  path: string;
}

// Walk up from cwd looking for the config file.
export function findConfigPath(start = process.cwd()): string | null {
  let dir = start;
  for (;;) {
    const p = join(dir, CONFIG_NAME);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(): LoadedConfig {
  const path = findConfigPath();
  if (!path) {
    die(
      "NO_CONFIG",
      `No ${CONFIG_NAME} found in this directory or any parent.`,
      "Run `runtime-agent-cli init` to scaffold one.",
    );
  }
  let config: Config;
  try {
    config = parse(readFileSync(path, "utf8")) as Config;
  } catch (e) {
    die("BAD_CONFIG", `Could not parse ${path}: ${(e as Error).message}`);
  }
  if (!config?.openapi_source) {
    die("BAD_CONFIG", `${path} is missing required key 'openapi_source'.`);
  }
  return { config, dir: dirname(path), path };
}

// "./openapi.json" → absolute path relative to the config dir. URLs pass through.
export function resolveSpecSource(loaded: LoadedConfig): string {
  const src = loaded.config.openapi_source;
  if (/^https?:\/\//.test(src)) return src;
  return resolve(loaded.dir, src);
}

// Pick the active environment: --env flag > config.environment > sole defined env.
export function selectEnv(
  loaded: LoadedConfig,
  flag?: string,
): { name: string; env: EnvConfig; base_url: string } {
  const envs = loaded.config.environments ?? {};
  const names = Object.keys(envs);
  let name = flag ?? loaded.config.environment ?? (names.length === 1 ? names[0] : undefined);
  if (!name) {
    die("NO_ENV", "No environment selected.", HINTS.nameEnv);
  }
  const env = envs[name];
  if (!env) {
    die("UNKNOWN_ENV", `Environment '${name}' is not defined in config.`, HINTS.nameEnv);
  }
  const base_url = env.base_url ?? loaded.config.base_url ?? "";
  if (!base_url) {
    die("NO_BASE_URL", `No base_url for environment '${name}'.`);
  }
  return { name, env, base_url };
}

const SENSITIVE = /^(authorization|cookie|x-api-key|api-key|x-auth-token)$/i;

export interface ResolvedHeaders {
  headers: Record<string, string>;
  redactKeys: Set<string>; // header names whose values must be redacted in dry-run output
}

// Resolve ${env:VAR} references at runtime. The agent never sees the raw secret;
// values sourced from env (or with sensitive names) are flagged for redaction.
export function resolveHeaders(env: EnvConfig): ResolvedHeaders {
  const headers: Record<string, string> = {};
  const redactKeys = new Set<string>();
  for (const [k, raw] of Object.entries(env.headers ?? {})) {
    let fromEnv = false;
    const value = String(raw).replace(/\$\{env:([A-Z0-9_]+)\}/gi, (_m, name) => {
      fromEnv = true;
      const v = process.env[name];
      if (v === undefined) {
        die("MISSING_ENV_VAR", `Header '${k}' references \${env:${name}} but $${name} is not set.`);
      }
      return v;
    });
    headers[k] = value;
    if (fromEnv || SENSITIVE.test(k)) redactKeys.add(k);
  }
  return { headers, redactKeys };
}

export function redact(headers: Record<string, string>, redactKeys: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = redactKeys.has(k) ? "***" : v;
  return out;
}
