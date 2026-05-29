import { describe, expect, test } from "bun:test";
import {
  formatContentList,
  formatContentRead,
  listContent,
  readContent,
} from "../../src/core/content-commands";
import type { WorkspaceAPI } from "../../src/skill-api";

describe("content commands", () => {
  test("lists posts as text and json", async () => {
    const posts = [
      { slug: "hello", path: "posts/hello.md", title: "Hello", date: "2026-05-29" },
    ];

    const result = await listContent(workspace({ posts }), "posts");

    expect(formatContentList(result, "posts")).toBe("1. Hello 2026-05-29 (posts/hello.md)");
    expect(formatContentList(result, "posts", { json: true })).toBe(
      JSON.stringify({ posts }, null, 2),
    );
  });

  test("reads numbered posts", async () => {
    const result = await readContent(
      workspace({
        posts: [{ slug: "hello", path: "posts/hello.md", title: "Hello" }],
        markdown: "# Hello",
      }),
      "posts",
      "1",
    );

    expect(formatContentRead(result)).toBe("# Hello");
    expect(JSON.parse(formatContentRead(result, { json: true }))).toMatchObject({
      path: "posts/hello.md",
      markdown: "# Hello",
      meta: {
        slug: "hello",
      },
    });
  });

  test("reads numbered pages", async () => {
    const result = await readContent(
      workspace({
        pages: [{ slug: "about", path: "pages/about.md", title: "About" }],
        markdown: "# About",
      }),
      "pages",
      "1",
    );

    expect(result.path).toBe("pages/about.md");
    expect(result.markdown).toBe("# About");
  });

  test("reports missing numbered selections", async () => {
    await expect(readContent(workspace({ posts: [] }), "posts", "1")).rejects.toThrow(
      "Post number not found: 1",
    );
  });
});

function workspace(input: {
  posts?: Awaited<ReturnType<WorkspaceAPI["listPosts"]>>;
  pages?: Awaited<ReturnType<WorkspaceAPI["listPages"]>>;
  markdown?: string | null;
}): Pick<WorkspaceAPI, "listPosts" | "readPost" | "listPages" | "readPage"> {
  return {
    listPosts: async () => input.posts ?? [],
    readPost: async () => input.markdown ?? null,
    listPages: async () => input.pages ?? [],
    readPage: async () => input.markdown ?? null,
  };
}
