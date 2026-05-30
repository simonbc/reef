import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ReefConfig = {
  root: string;
  title: string;
  domain: string;
  anthropicKeyEnv: string;
  trustProjectSkills: boolean;
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
    trustProjectSkills: booleanValue(project.top.trust_project_skills, false),
    skillConfig: mergedSkillConfig.flat,
    globalAccounts: mergedSkillConfig.accounts,
  };

  return config;
}

function parseSimpleToml(source: string, path: string): {
  top: Record<string, unknown>;
  sections: Record<string, Record<string, unknown>>;
} {
  let parsed: Record<string, unknown>;
  try {
    parsed = Bun.TOML.parse(source) as Record<string, unknown>;
  } catch (error) {
    const lineNumber = tomlErrorLine(error);
    const line = lineNumber ? ` at line ${lineNumber}` : "";
    throw new Error(`Invalid TOML in ${path}${line}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const top: Record<string, unknown> = {};
  const sections: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (isPlainRecord(value)) {
      flattenTomlTable(key, value, sections);
    } else {
      top[key] = value;
    }
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
  return parseSimpleToml(await readFile(path, "utf8"), path);
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

function flattenTomlTable(
  section: string,
  values: Record<string, unknown>,
  sections: Record<string, Record<string, unknown>>,
): void {
  const scalars: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (isPlainRecord(value)) {
      flattenTomlTable(`${section}.${key}`, value, sections);
    } else {
      scalars[key] = value;
    }
  }

  if (Object.keys(scalars).length > 0) {
    sections[section] = scalars;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tomlErrorLine(error: unknown): number | undefined {
  const errors =
    typeof error === "object" && error !== null && "errors" in error
      ? (error as { errors?: unknown }).errors
      : undefined;
  if (Array.isArray(errors)) {
    const nestedLine = errors
      .map((item) =>
        typeof item === "object" && item !== null && "line" in item
          ? (item as { line?: unknown }).line
          : undefined,
      )
      .find((line): line is number => typeof line === "number");
    if (nestedLine !== undefined) {
      return nestedLine + 1;
    }
  }

  return typeof error === "object" && error !== null && "line" in error &&
    typeof (error as { line?: unknown }).line === "number"
    ? Number((error as { line: number }).line)
    : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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
