import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkspace } from "../../src/core/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createWorkspace", () => {
  test("lists posts newest first and reads by slug or path", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "older.md"),
      "---\ntitle: Older\ndate: 2026-05-27\n---\n\n# Older\n",
    );
    await writeFile(
      join(root, "posts", "newer.md"),
      "---\ntitle: Newer\ndate: 2026-05-28\n---\n\n# Newer\n",
    );

    const workspace = await createWorkspace(root);
    const posts = await workspace.listPosts();

    expect(posts.map((post) => post.slug)).toEqual(["newer", "older"]);
    expect(await workspace.readPost("newer")).toContain("# Newer");
    expect(await workspace.readPost("posts/older.md")).toContain("# Older");
  });

  test("writes per-skill state as JSON", async () => {
    const root = await tempRoot();
    const workspace = await createWorkspace(root);

    await workspace.skillState.write("wordpress", "media:hero.jpg", {
      id: 123,
      url: "https://example.com/hero.jpg",
    });

    await expect(workspace.skillState.read("wordpress", "media:hero.jpg")).resolves.toEqual({
      id: 123,
      url: "https://example.com/hero.jpg",
    });
  });

  test("writes, reads, searches, and deletes pages", async () => {
    const root = await tempRoot();
    const workspace = await createWorkspace(root);

    await workspace.writePage("about", "# About reef\n\nLocal social web runtime.");

    await expect(workspace.readPage("about")).resolves.toContain("Local social web");
    await expect(workspace.listPages()).resolves.toMatchObject([
      {
        slug: "about",
        path: "pages/about.md",
        title: "About reef",
      },
    ]);
    await expect(workspace.search("social web")).resolves.toEqual([
      { kind: "page", slug: "about" },
    ]);

    await workspace.deletePage("about");
    await expect(workspace.readPage("about")).resolves.toBeNull();
  });

  test("writes, lists, reads, and deletes media files", async () => {
    const root = await tempRoot();
    const workspace = await createWorkspace(root);
    const bytes = new Uint8Array([1, 2, 3]);

    await workspace.writeMedia("images/hero.bin", bytes);

    await expect(workspace.listMedia()).resolves.toEqual(["images/hero.bin"]);
    await expect(workspace.readMedia("images/hero.bin")).resolves.toEqual(bytes);

    await workspace.deleteMedia("images/hero.bin");
    await expect(workspace.readMedia("images/hero.bin")).resolves.toBeNull();
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-workspace-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  return root;
}
