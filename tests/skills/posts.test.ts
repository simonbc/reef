import { describe, expect, test } from "bun:test";
import posts from "../../skills/posts";
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
    const readPaths: string[] = [];
    const ctx = context({
      posts: [],
      markdown: "# Hello",
      readPost: async (path) => {
        readPaths.push(path);
        return "# Hello";
      },
    });

    await expect(tool("read").run({ path: "posts/hello.md" }, ctx)).resolves.toBe("# Hello");
    expect(readPaths).toEqual(["posts/hello.md"]);
    await expect(
      tool("read").run({ path: "posts/missing.md" }, context({ posts: [], markdown: null })),
    ).resolves.toBe("Post not found: posts/missing.md");
  });

  test("reads numbered post selections from the current post list", async () => {
    const readPaths: string[] = [];
    const result = await tool("read").run(
      { path: "1" },
      context({
        posts: [{ slug: "hello", path: "posts/hello.md", title: "Hello" }],
        markdown: "# Hello",
        readPost: async (path) => {
          readPaths.push(path);
          return "# Hello";
        },
      }),
    );

    expect(result).toBe("# Hello");
    expect(readPaths).toEqual(["posts/hello.md"]);
  });

  test("creates a dated markdown post", async () => {
    const created: { slug: string; date: string; body: string; title?: string }[] = [];

    const result = await tool("create").run(
      {
        slug: "hello-from-reef",
        title: "Hello from Reef",
        date: "2026-05-29",
        body: "if you are reading this, reef can post to mastodon!",
      },
      context({
        posts: [],
        markdown: null,
        createPost: async (slug, date, body, title) => {
          created.push({ slug, date, body, title });
        },
      }),
    );

    expect(result).toBe("Created posts/hello-from-reef.md.");
    expect(created).toEqual([
      {
        slug: "hello-from-reef",
        title: "Hello from Reef",
        date: "2026-05-29",
        body: "if you are reading this, reef can post to mastodon!",
      },
    ]);
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
  readPost?: WorkspaceAPI["readPost"];
  createPost?: WorkspaceAPI["createPost"];
}): ToolContext {
  return {
    config: {},
    secrets: {},
    workspace: {
      listPosts: async () => input.posts,
      readPost: input.readPost ?? (async () => input.markdown),
      createPost:
        input.createPost ??
        (async () => {
          throw new Error("createPost should not be called");
        }),
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}
