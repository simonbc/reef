import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentHarness = "codex";

export interface AgentInstallResult {
  harness: AgentHarness;
  targetPath: string;
}

export interface AgentProjectInitResult {
  harness: AgentHarness;
  status: "created" | "updated" | "unchanged";
  targetPath: string;
}

const reefAgentSection = `## Reef Agent Operation

When working here, use Reef as the local runtime. Markdown in \`posts/\` and \`pages/\` is canonical source.
Inspect content with \`reef posts --json\`, \`reef pages --json\`, and \`reef post read <slug|path|number> --json\`.
Edit canonical markdown and config files directly. Bare \`reef\` serves a local workspace app that live-renders markdown.
Do not publish or update remote platforms without explicit user intent.
`;

export async function installAgentSupport(input: {
  harness: string;
  homeDir?: string;
}): Promise<AgentInstallResult> {
  const harness = parseHarness(input.harness);
  const targetPath = codexSkillTarget(input.homeDir ?? homedir());
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(codexSkillSource(), targetPath);

  return { harness, targetPath };
}

export async function initAgentProject(input: {
  harness: string;
  root: string;
}): Promise<AgentProjectInitResult> {
  const harness = parseHarness(input.harness);
  const targetPath = join(input.root, "AGENTS.md");
  let existing = "";
  let existed = true;
  try {
    existing = await readFile(targetPath, "utf8");
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
    existed = false;
  }

  if (existing.includes("## Reef Agent Operation")) {
    return { harness, status: "unchanged", targetPath };
  }

  const separator = existing.trim() ? "\n\n" : "";
  await writeFile(targetPath, `${existing.trimEnd()}${separator}${reefAgentSection}`, "utf8");

  return { harness, status: existed ? "updated" : "created", targetPath };
}

export function formatAgentInstallResult(
  result: AgentInstallResult,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify({
      harness: result.harness,
      targetPath: result.targetPath,
    });
  }

  return `Installed Reef ${displayHarness(result.harness)} support at ${result.targetPath}.`;
}

export function formatAgentProjectInitResult(
  result: AgentProjectInitResult,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify({
      harness: result.harness,
      status: result.status,
      targetPath: result.targetPath,
    });
  }

  if (result.status === "unchanged") {
    return `Reef project instructions already exist in ${result.targetPath}.`;
  }

  const verb = result.status === "created" ? "Created" : "Updated";
  return `${verb} Reef project instructions in ${result.targetPath}.`;
}

function parseHarness(value: string): AgentHarness {
  if (value === "codex") {
    return value;
  }

  throw new Error(`Unsupported agent harness: ${value}`);
}

function codexSkillTarget(homeDir: string): string {
  return join(homeDir, ".codex", "skills", "reef", "SKILL.md");
}

function codexSkillSource(): string {
  return join(repoRoot(), "codex", "skills", "reef", "SKILL.md");
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function displayHarness(harness: AgentHarness): string {
  return harness === "codex" ? "Codex" : harness;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
