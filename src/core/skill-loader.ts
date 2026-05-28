import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import type { ReefConfig } from "./config";
import type { SkillDef, ToolContext, ToolDef, WorkspaceAPI } from "../skill-api";

export type LoadedSkill = {
  name: string;
  version: string;
  status: "loaded" | "error";
  tools: ToolDef[];
  systemPrompt?: string;
  error?: string;
  context: ToolContext;
};

export async function loadSkills(input: {
  config: ReefConfig;
  workspace: WorkspaceAPI;
}): Promise<LoadedSkill[]> {
  const skillsDir = resolve(input.config.root, "skills");
  const entries = await readSkillDirs(skillsDir);
  const loaded: LoadedSkill[] = [];
  const seenNames = new Set<string>();

  for (const dirName of entries) {
    const skillDir = join(skillsDir, dirName);
    const manifestPath = join(skillDir, "skill.toml");
    const indexPath = join(skillDir, "index.ts");

    try {
      const manifest = parseSkillManifest(await readFile(manifestPath, "utf8"));
      if (seenNames.has(manifest.name)) {
        throw new Error(`duplicate skill name: ${manifest.name}`);
      }
      seenNames.add(manifest.name);

      const imported = (await import(pathToFileURL(indexPath).href)) as {
        default?: SkillDef;
      };
      const skill = imported.default;
      if (!skill) {
        throw new Error("index.ts must default-export defineSkill(...)");
      }
      if (skill.name !== manifest.name) {
        throw new Error(`name mismatch: manifest '${manifest.name}' vs code '${skill.name}'`);
      }

      loaded.push({
        name: skill.name,
        version: manifest.version,
        status: "loaded",
        tools: skill.tools,
        systemPrompt: skill.systemPrompt,
        context: {
          config: input.config.skillConfig[skill.name] ?? {},
          secrets: envSecretsFor(skill.name),
          workspace: input.workspace,
        },
      });
    } catch (error) {
      loaded.push({
        name: dirName,
        version: "unknown",
        status: "error",
        tools: [],
        error: error instanceof Error ? error.message : String(error),
        context: {
          config: {},
          secrets: {},
          workspace: input.workspace,
        },
      });
    }
  }

  return loaded;
}

function parseSkillManifest(source: string): {
  name: string;
  version: string;
} {
  let inSkillSection = false;
  const values: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) {
      continue;
    }

    const section = /^\[([A-Za-z0-9_-]+)\]$/.exec(line);
    if (section) {
      inSkillSection = section[1] === "skill";
      continue;
    }

    if (!inSkillSection) {
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (kv) {
      values[kv[1]] = kv[2];
    }
  }

  if (!values.name) {
    throw new Error("skill.toml missing [skill].name");
  }

  return {
    name: values.name,
    version: values.version ?? "0.0.0",
  };
}

async function readSkillDirs(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function envSecretsFor(skillName: string): Record<string, string> {
  const prefix = `REEF_${skillName.toUpperCase().replace(/-/g, "_")}_`;
  const secrets: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value) {
      secrets[key.slice(prefix.length).toLowerCase()] = value;
    }
  }

  return secrets;
}
