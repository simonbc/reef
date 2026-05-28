import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export type ReefConfig = {
  root: string;
  title: string;
  domain: string;
  anthropicKeyEnv: string;
  skillConfig: Record<string, Record<string, unknown>>;
};

export async function loadConfig(root: string): Promise<ReefConfig> {
  const configPath = join(root, "reef.toml");
  const exists = await fileExists(configPath);

  if (!exists) {
    return {
      root,
      title: basenameTitle(root),
      domain: "",
      anthropicKeyEnv: "ANTHROPIC_API_KEY",
      skillConfig: {},
    };
  }

  const parsed = parseSimpleToml(await readFile(configPath, "utf8"));

  return {
    root,
    title: stringValue(parsed.top.title, basenameTitle(root)),
    domain: stringValue(parsed.top.domain, ""),
    anthropicKeyEnv: stringValue(parsed.top.anthropic_key_env, "ANTHROPIC_API_KEY"),
    skillConfig: parsed.sections,
  };
}

function parseSimpleToml(source: string): {
  top: Record<string, unknown>;
  sections: Record<string, Record<string, unknown>>;
} {
  const top: Record<string, unknown> = {};
  const sections: Record<string, Record<string, unknown>> = {};
  let current = top;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) {
      continue;
    }

    const section = /^\[([A-Za-z0-9_-]+)\]$/.exec(line);
    if (section) {
      current = sections[section[1]] ??= {};
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) {
      continue;
    }

    current[kv[1]] = parseTomlScalar(kv[2]);
  }

  return { top, sections };
}

function parseTomlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function basenameTitle(root: string): string {
  return root.replace(/\/+$/, "").split("/").at(-1) || "reef";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
