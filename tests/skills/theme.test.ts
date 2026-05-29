import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import theme from "../../skills/theme";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("theme skill", () => {
  test("reads default theme files when none exist yet", async () => {
    const root = await tempRoot();

    const result = String(await tool("read").run({}, context(root)));

    expect(result).toContain("theme/layout.html");
    expect(result).toContain("{{content}}");
    expect(result).toContain("theme/styles.css");
    expect(result).toContain("font-family");
  });

  test("updates canonical CSS", async () => {
    const root = await tempRoot();

    const result = await tool("update_css").run(
      { css: "body { background: papayawhip; }\n" },
      context(root),
    );

    expect(result).toBe("Updated theme/styles.css.");
    await expect(readFile(join(root, "theme", "styles.css"), "utf8")).resolves.toBe(
      "body { background: papayawhip; }\n",
    );
  });

  test("updates canonical layout", async () => {
    const root = await tempRoot();

    const result = await tool("update_layout").run(
      { html: "<main>{{content}}</main>\n" },
      context(root),
    );

    expect(result).toBe("Updated theme/layout.html.");
    await expect(readFile(join(root, "theme", "layout.html"), "utf8")).resolves.toBe(
      "<main>{{content}}</main>\n",
    );
  });
});

function tool(name: string) {
  const found = theme.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function context(root: string): ToolContext {
  return {
    config: {},
    secrets: {},
    workspace: {
      root,
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-theme-"));
  roots.push(root);
  return root;
}
