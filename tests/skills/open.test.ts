import { describe, expect, test } from "bun:test";
import open from "../../skills/open";
import type { OpenTarget } from "../../src/core/open";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

describe("open skill", () => {
  test("opens the local server", async () => {
    const opened: OpenTarget[] = [];

    const result = await tool("server").run({}, context({ opened }));

    expect(result).toBe("Opened http://localhost:3000");
    expect(opened).toEqual([{ type: "server", url: "http://localhost:3000" }]);
  });

  test("opens the latest post URL", async () => {
    const opened: OpenTarget[] = [];

    const result = await tool("view_latest_post").run(
      {},
      context({
        opened,
        posts: [
          { slug: "newer", path: "posts/newer.md", title: "Newer", date: "2026-05-30" },
          { slug: "older", path: "posts/older.md", title: "Older", date: "2026-05-29" },
        ],
      }),
    );

    expect(result).toBe("Opened latest post: http://localhost:3000/posts/newer/");
    expect(opened).toEqual([{ type: "url", url: "http://localhost:3000/posts/newer/" }]);
  });

  test("opens named post and page URLs", async () => {
    const opened: OpenTarget[] = [];
    const ctx = context({ opened });

    await expect(tool("view_post").run({ slug: "hello" }, ctx)).resolves.toBe(
      "Opened post hello: http://localhost:3000/posts/hello/",
    );
    await expect(tool("view_page").run({ slug: "about" }, ctx)).resolves.toBe(
      "Opened page about: http://localhost:3000/pages/about/",
    );
    expect(opened).toEqual([
      { type: "url", url: "http://localhost:3000/posts/hello/" },
      { type: "url", url: "http://localhost:3000/pages/about/" },
    ]);
  });

  test("reports when there are no posts to view", async () => {
    await expect(tool("view_latest_post").run({}, context({ opened: [] }))).resolves.toBe(
      "No posts found.",
    );
  });
});

function tool(name: string) {
  const found = open.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function context(input: {
  opened: OpenTarget[];
  posts?: Awaited<ReturnType<WorkspaceAPI["listPosts"]>>;
}): ToolContext {
  return {
    config: {
      __open_runner: (target: OpenTarget) => {
        input.opened.push(target);
      },
    },
    secrets: {},
    workspace: {
      listPosts: async () => input.posts ?? [],
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}
