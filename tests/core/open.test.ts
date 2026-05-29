import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveOpenTarget, resolveViewTarget } from "../../src/core/open";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resolveViewTarget", () => {
  test("resolves built post and page URLs", async () => {
    await expect(resolveViewTarget({ kind: "post", slug: "hello", port: 3001 })).resolves.toEqual({
      type: "url",
      url: "http://localhost:3001/posts/hello/",
    });
    await expect(resolveViewTarget({ kind: "page", slug: "about", port: 3001 })).resolves.toEqual({
      type: "url",
      url: "http://localhost:3001/pages/about/",
    });
  });
});

describe("resolveOpenTarget", () => {
  test("opens the local server by default", async () => {
    await expect(resolveOpenTarget({ root: "/tmp/reef", args: [], port: 4321 })).resolves.toEqual({
      type: "server",
      url: "http://localhost:4321",
    });
  });

  test("resolves post and page markdown files", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "posts", "hello.md"), "# Hello");
    await writeFile(join(root, "pages", "about.md"), "# About");

    await expect(resolveOpenTarget({ root, args: ["post", "hello"] })).resolves.toEqual({
      type: "file",
      path: join(root, "posts", "hello.md"),
    });
    await expect(resolveOpenTarget({ root, args: ["page", "pages/about.md"] })).resolves.toEqual({
      type: "file",
      path: join(root, "pages", "about.md"),
    });
  });

  test("resolves numbered post and page selections", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "posts", "hello.md"), "# Hello");
    await writeFile(join(root, "pages", "about.md"), "# About");

    await expect(
      resolveOpenTarget({
        root,
        args: ["post", "1"],
        posts: [{ path: "posts/hello.md" }],
      }),
    ).resolves.toEqual({
      type: "file",
      path: join(root, "posts", "hello.md"),
    });
    await expect(
      resolveOpenTarget({
        root,
        args: ["page", "1"],
        pages: [{ path: "pages/about.md" }],
      }),
    ).resolves.toEqual({
      type: "file",
      path: join(root, "pages", "about.md"),
    });
  });

  test("reports missing markdown files", async () => {
    await expect(resolveOpenTarget({ root: await tempRoot(), args: ["post", "missing"] })).rejects.toThrow(
      "Post not found: missing",
    );
  });

  test("reports missing numbered selections", async () => {
    await expect(
      resolveOpenTarget({ root: await tempRoot(), args: ["post", "2"], posts: [] }),
    ).rejects.toThrow("Post number not found: 2");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-open-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  await Bun.write(join(root, "pages", ".keep"), "");
  return root;
}
