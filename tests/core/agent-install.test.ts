import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatAgentInstallResult,
  formatAgentProjectInitResult,
  initAgentProject,
  installAgentSupport,
} from "../../src/core/agent-install";

describe("agent install commands", () => {
  test("installs Codex support into the user Codex skills directory", async () => {
    const home = await tempRoot("reef-agent-home-");

    const result = await installAgentSupport({ harness: "codex", homeDir: home });

    expect(result.targetPath).toBe(join(home, ".codex", "skills", "reef", "SKILL.md"));
    const installed = await readFile(result.targetPath, "utf8");
    expect(installed).toContain("name: reef");
    expect(installed).toContain("## Core Rules");
    expect(formatAgentInstallResult(result)).toBe(`Installed Reef Codex support at ${result.targetPath}.`);
    expect(JSON.parse(formatAgentInstallResult(result, { json: true }))).toEqual({
      harness: "codex",
      targetPath: result.targetPath,
    });
  });

  test("keeps the Codex skill front matter parseable by Codex", async () => {
    const home = await tempRoot("reef-agent-home-");

    const result = await installAgentSupport({ harness: "codex", homeDir: home });
    const installed = await readFile(result.targetPath, "utf8");

    expect(installed).toContain('description: "Use when working with a Reef runtime from Codex:');
    expect(parseFrontMatter(installed)).toEqual({
      name: "reef",
      description:
        "Use when working with a Reef runtime from Codex: inspect posts/pages/config, edit canonical markdown/config files, run the local workspace app, set up publishing targets, and publish or update WordPress or Mastodon through Reef CLI commands.",
      "short-description": "Operate a Reef runtime from Codex",
    });
  });

  test("initializes project instructions idempotently", async () => {
    const root = await tempRoot("reef-agent-project-");
    await writeFile(join(root, "AGENTS.md"), "# Existing\n\nKeep this.\n");

    const first = await initAgentProject({ harness: "codex", root });
    const second = await initAgentProject({ harness: "codex", root });

    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(first.status).toBe("updated");
    expect(second.status).toBe("unchanged");
    expect(agents.match(/## Reef Agent Operation/g)).toHaveLength(1);
    expect(agents).toContain("Keep this.");
    expect(agents).toContain("Markdown in `posts/` and `pages/` is canonical source.");
    expect(formatAgentProjectInitResult(first)).toBe(`Updated Reef project instructions in ${first.targetPath}.`);
  });

  test("rejects unsupported harnesses", async () => {
    await expect(
      installAgentSupport({ harness: "chatgpt", homeDir: await tempRoot("reef-agent-home-") }),
    ).rejects.toThrow("Unsupported agent harness: chatgpt");
  });
});

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function parseFrontMatter(source: string): Record<string, string> {
  const match = source.match(/^---\n(?<frontMatter>.*?)\n---/ms);
  if (!match?.groups?.frontMatter) {
    throw new Error("missing front matter");
  }

  const result: Record<string, string> = {};
  for (const line of match.groups.frontMatter.split("\n")) {
    if (!line.trim() || line === "metadata:") {
      continue;
    }
    const trimmed = line.trim();
    const separator = trimmed.indexOf(":");
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value.replace(/^"|"$/g, "");
  }
  return result;
}
