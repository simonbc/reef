import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ReefConfig = {
  root: string;
  title: string;
  domain: string;
  anthropicKeyEnv: string;
  skillConfig: Record<string, Record<string, unknown>>;
  globalAccounts: Record<string, Record<string, Record<string, unknown>>>;
};

export type LoadConfigOptions = {
  globalConfigPath?: string;
};

export async function loadConfig(
  root: string,
  options: LoadConfigOptions = {},
): Promise<ReefConfig> {
  const projectPath = join(root, "reef.toml");
  const globalPath = options.globalConfigPath ?? join(homedir(), ".reef", "config.toml");
  const project = await readOptionalToml(projectPath);
  const global = await readOptionalToml(globalPath);
  const mergedSkillConfig = mergeSkillConfig(global.sections, project.sections);

  const config = {
    root,
    title: stringValue(project.top.title, basenameTitle(root)),
    domain: stringValue(project.top.domain, ""),
    anthropicKeyEnv: stringValue(
      project.top.anthropic_key_env,
      stringValue(global.top.anthropic_key_env, "ANTHROPIC_API_KEY"),
    ),
    skillConfig: mergedSkillConfig.flat,
    globalAccounts: mergedSkillConfig.accounts,
  };

  return config;
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

    const section = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
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

async function readOptionalToml(path: string): Promise<{
  top: Record<string, unknown>;
  sections: Record<string, Record<string, unknown>>;
}> {
  const exists = await fileExists(path);
  if (!exists) {
    return { top: {}, sections: {} };
  }
  return parseSimpleToml(await readFile(path, "utf8"));
}

function mergeSkillConfig(
  globalSections: Record<string, Record<string, unknown>>,
  projectSections: Record<string, Record<string, unknown>>,
): {
  flat: Record<string, Record<string, unknown>>;
  accounts: Record<string, Record<string, Record<string, unknown>>>;
} {
  const globalFlat: Record<string, Record<string, unknown>> = {};
  const accounts: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const [section, values] of Object.entries(globalSections)) {
    const [skillName, accountName] = section.split(".", 2);
    if (accountName) {
      accounts[skillName] ??= {};
      accounts[skillName][accountName] = values;
    } else {
      globalFlat[section] = values;
    }
  }

  const flat: Record<string, Record<string, unknown>> = { ...globalFlat };

  for (const [section, values] of Object.entries(projectSections)) {
    flat[section] = {
      ...(globalFlat[section] ?? {}),
      ...values,
    };
  }

  return { flat, accounts };
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
