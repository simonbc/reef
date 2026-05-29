import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import githubPages from "../../skills/github-pages";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("github-pages skill", () => {
  test("publishes an existing dist directory through injectable git runner", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "dist", "index.html"), "<h1>Hello</h1>");
    const commands: string[][] = [];

    const result = await publishTool().run(
      {},
      context(root, {
        repo: "git@github.com:simonbc/reef-site.git",
        branch: "gh-pages",
        runGit: async (args: string[]) => {
          commands.push(args);
          return "";
        },
      }),
    );

    expect(result).toBe("Published dist/ to GitHub Pages branch gh-pages.");
    expect(commands).toEqual([
      ["init"],
      ["checkout", "-B", "gh-pages"],
      ["add", "-A"],
      ["commit", "-m", "Publish Reef site"],
      ["remote", "add", "origin", "git@github.com:simonbc/reef-site.git"],
      ["push", "-f", "origin", "gh-pages"],
    ]);
  });

  test("returns configuration guidance when repo is missing", async () => {
    const result = await publishTool().run({}, context(await tempRoot(), {}));

    expect(String(result)).toContain("Skill 'github-pages' is not configured.");
    expect(String(result)).toContain("[github-pages].repo");
    expect(String(result)).toContain("~/.reef/config.toml");
    expect(String(result)).toContain("[github-pages].branch");
  });
});

function publishTool() {
  const tool = githubPages.tools.find((candidate) => candidate.name === "publish_site");
  if (!tool) {
    throw new Error("publish_site tool missing");
  }
  return tool;
}

function context(
  root: string,
  config: Record<string, unknown>,
): ToolContext {
  return {
    config,
    secrets: {},
    workspace: {
      root,
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-gh-pages-"));
  roots.push(root);
  await Bun.write(join(root, "dist", ".keep"), "");
  return root;
}
