import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ConfigSetResult = {
  path: string;
  key: string;
  value: string | number | boolean;
};

export async function readProjectConfig(root: string): Promise<string> {
  try {
    return await readFile(projectConfigPath(root), "utf8");
  } catch {
    return "";
  }
}

export async function setProjectConfigValue(
  root: string,
  keyPath: string,
  rawValue: string,
): Promise<ConfigSetResult> {
  const path = projectConfigPath(root);
  const value = parseConfigValue(rawValue);
  const next = setTomlValue(await readProjectConfig(root), keyPath, value);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  return { path, key: keyPath, value };
}

export function formatConfigSetResult(
  result: ConfigSetResult,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }

  return `Set ${result.key} in ${result.path}.`;
}

export function formatProjectConfig(
  path: string,
  source: string,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify({ path, source }, null, 2);
  }

  return source.trim() ? source : "(empty reef.toml)";
}

function setTomlValue(
  source: string,
  keyPath: string,
  value: string | number | boolean,
): string {
  const { section, key } = parseKeyPath(keyPath);
  const trimmedSource = source.replace(/\s*$/, "");
  const lines = trimmedSource ? trimmedSource.split(/\r?\n/) : [];
  const rendered = `${key} = ${renderTomlValue(value)}`;

  if (!section) {
    const existing = topLevelKeyIndex(lines, key);
    if (existing !== -1) {
      lines[existing] = rendered;
    } else {
      const insertAt = firstSectionIndex(lines);
      if (insertAt === -1) {
        lines.push(rendered);
      } else {
        lines.splice(insertAt, 0, rendered, "");
      }
    }
    return `${lines.join("\n")}\n`;
  }

  const sectionHeader = `[${section}]`;
  let sectionIndex = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionIndex === -1) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(sectionHeader, rendered);
    return `${lines.join("\n")}\n`;
  }

  const end = nextSectionIndex(lines, sectionIndex + 1);
  const existing = sectionKeyIndex(lines, sectionIndex + 1, end, key);
  if (existing !== -1) {
    lines[existing] = rendered;
  } else {
    lines.splice(end, 0, rendered);
  }

  return `${lines.join("\n")}\n`;
}

function parseKeyPath(keyPath: string): { section?: string; key: string } {
  const trimmed = keyPath.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error("Config key must use letters, numbers, dots, underscores, or hyphens.");
  }

  const parts = trimmed.split(".");
  const key = parts.pop();
  if (!key) {
    throw new Error("Config key is required.");
  }

  return {
    section: parts.length ? parts.join(".") : undefined,
    key,
  };
}

function parseConfigValue(rawValue: string): string | number | boolean {
  const trimmed = rawValue.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const numeric = Number(trimmed);
  return trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed;
}

function renderTomlValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function topLevelKeyIndex(lines: string[], key: string): number {
  const sectionStart = firstSectionIndex(lines);
  const end = sectionStart === -1 ? lines.length : sectionStart;
  return sectionKeyIndex(lines, 0, end, key);
}

function sectionKeyIndex(lines: string[], start: number, end: number, key: string): number {
  for (let index = start; index < end; index += 1) {
    const match = /^([A-Za-z0-9_-]+)\s*=/.exec(lines[index].trim());
    if (match?.[1] === key) {
      return index;
    }
  }

  return -1;
}

function firstSectionIndex(lines: string[]): number {
  return lines.findIndex((line) => /^\[[A-Za-z0-9_.-]+\]$/.test(line.trim()));
}

function nextSectionIndex(lines: string[], start: number): number {
  const relative = lines.slice(start).findIndex((line) => /^\[[A-Za-z0-9_.-]+\]$/.test(line.trim()));
  return relative === -1 ? lines.length : start + relative;
}

function projectConfigPath(root: string): string {
  return join(root, "reef.toml");
}
