import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLivePreview } from "../../src/core/live-preview";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createLivePreview", () => {
  test("renders a workspace app shell from posts and pages", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nFirst post.",
    );
    await writeFile(join(root, "pages", "about.md"), "# About\n\nAbout reef.");

    const preview = createLivePreview({ root, title: "Runtime Reef" });
    const response = await preview.render("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Runtime Reef");
    expect(body).toContain("/posts/hello/");
  });

  test("live-renders posts from markdown without writing dist", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nFirst post.",
    );

    const preview = createLivePreview({ root, title: "Runtime Reef" });
    const response = await preview.render("/posts/hello/");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("<h1>Hello</h1>");
    await expect(Bun.file(join(root, "dist", "index.html")).exists()).resolves.toBe(false);
  });

  test("renders frontmatter titles for posts without markdown headings", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello from frontmatter\ndate: 2026-05-29\n---\n\nBody without heading.",
    );

    const preview = createLivePreview({ root, title: "Runtime Reef" });
    const body = await preview.render("/posts/hello/").then((response) => response.text());

    expect(body).toContain("<h1>Hello from frontmatter</h1>");
    expect(body).toContain("Body without heading.");
  });

  test("invalidates cached markdown when the source mtime changes", async () => {
    const root = await tempRoot();
    const postPath = join(root, "posts", "hello.md");
    await writeFile(postPath, "# Hello\n\nFirst body.");

    const preview = createLivePreview({ root, title: "Runtime Reef" });
    await expect((await preview.render("/posts/hello/")).text()).resolves.toContain("First body.");

    await Bun.sleep(5);
    await writeFile(postPath, "# Hello\n\nSecond body.");

    await expect((await preview.render("/posts/hello/")).text()).resolves.toContain("Second body.");
  });

  test("returns 404 for missing markdown source", async () => {
    const preview = createLivePreview({ root: await tempRoot(), title: "Runtime Reef" });

    const response = await preview.render("/posts/missing/");

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("Markdown source was not found.");
  });

  test("does not render markdown outside canonical content directories", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "secret.md"), "# Secret\n\nOutside.");
    const preview = createLivePreview({ root, title: "Runtime Reef" });

    const response = await preview.render("/posts/../secret/");

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain("Outside.");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-live-preview-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  await Bun.write(join(root, "pages", ".keep"), "");
  return root;
}
