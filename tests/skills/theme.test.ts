import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import theme from "../../skills/theme";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";
import { createWorkspace } from "../../src/core/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("theme skill", () => {
  test("reads default theme files when none exist yet", async () => {
    const root = await tempRoot();

    const result = String(await tool("read").run({}, await context(root)));

    expect(result).toContain("theme/layout.html");
    expect(result).toContain("{{content}}");
    expect(result).toContain("theme/styles.css");
    expect(result).toContain("font-family");
  });

  test("updates canonical CSS", async () => {
    const root = await tempRoot();
    await writePost(root);

    const result = await tool("update_css").run(
      { css: "body { background: papayawhip; }\n" },
      await context(root),
    );

    expect(result).toBe("Updated theme/styles.css and rebuilt dist/.");
    await expect(readFile(join(root, "theme", "styles.css"), "utf8")).resolves.toBe(
      "body { background: papayawhip; }\n",
    );
    await expect(readFile(join(root, "dist", "styles.css"), "utf8")).resolves.toBe(
      "body { background: papayawhip; }\n",
    );
  });

  test("updates canonical layout", async () => {
    const root = await tempRoot();
    await writePost(root);

    const result = await tool("update_layout").run(
      { html: "<main>{{content}}</main>\n" },
      await context(root),
    );

    expect(result).toBe("Updated theme/layout.html and rebuilt dist/.");
    await expect(readFile(join(root, "theme", "layout.html"), "utf8")).resolves.toBe(
      "<main>{{content}}</main>\n",
    );
    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      "<main><section>",
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

async function context(root: string): Promise<ToolContext> {
  return {
    config: {},
    secrets: {},
    workspace: await createWorkspace(root),
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-theme-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  return root;
}

async function writePost(root: string): Promise<void> {
  await writeFile(
    join(root, "posts", "hello.md"),
    "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nBody.",
  );
}
