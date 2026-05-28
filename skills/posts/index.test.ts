import { describe, expect, test } from "bun:test";
import posts from "./index";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

describe("posts skill", () => {
  test("lists posts with paths and titles", async () => {
    const result = await tool("list").run({}, context({
      posts: [
        { slug: "hello", path: "posts/hello.md", title: "Hello" },
        { slug: "second", path: "posts/second.md" },
      ],
      markdown: null,
    }));

    expect(result).toBe("posts/hello.md - Hello\nposts/second.md");
  });

  test("reads posts by path and reports missing posts", async () => {
    const ctx = context({
      posts: [],
      markdown: "# Hello",
    });

    await expect(tool("read").run({ path: "posts/hello.md" }, ctx)).resolves.toBe("# Hello");
    await expect(
      tool("read").run({ path: "posts/missing.md" }, context({ posts: [], markdown: null })),
    ).resolves.toBe("Post not found: posts/missing.md");
  });
});

function tool(name: string) {
  const found = posts.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function context(input: {
  posts: Awaited<ReturnType<WorkspaceAPI["listPosts"]>>;
  markdown: string | null;
}): ToolContext {
  return {
    config: {},
    secrets: {},
    workspace: {
      listPosts: async () => input.posts,
      readPost: async () => input.markdown,
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}
