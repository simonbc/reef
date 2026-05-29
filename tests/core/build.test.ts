import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSite } from "../../src/core/build";
import { createWorkspace } from "../../src/core/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("buildSite", () => {
  test("renders a feed-first static site with posts, pages, feed, and CSS", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nFirst post.",
    );
    await writeFile(join(root, "pages", "about.md"), "# About\n\nAbout reef.");

    const result = await buildSite({
      title: "Simon's Reef",
      domain: "https://simonbc.com",
      workspace: await createWorkspace(root),
    });

    expect(result.files.sort()).toEqual([
      "dist/feed.json",
      "dist/index.html",
      "dist/pages/about/index.html",
      "dist/posts/hello/index.html",
      "dist/styles.css",
    ]);

    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      "Simon's Reef",
    );
    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      "/posts/hello/",
    );
    await expect(readFile(join(root, "dist", "posts", "hello", "index.html"), "utf8")).resolves.toContain(
      "<h1>Hello</h1>",
    );
    await expect(readFile(join(root, "dist", "pages", "about", "index.html"), "utf8")).resolves.toContain(
      "About reef.",
    );

    const feed = JSON.parse(await readFile(join(root, "dist", "feed.json"), "utf8"));
    expect(feed).toMatchObject({
      title: "Simon's Reef",
      home_page_url: "https://simonbc.com",
      feed_url: "https://simonbc.com/feed.json",
      items: [
        {
          id: "hello",
          url: "https://simonbc.com/posts/hello/",
          title: "Hello",
          date_published: "2026-05-29",
        },
      ],
    });
  });

  test("uses canonical theme files when present", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nFirst post.",
    );
    await Bun.write(
      join(root, "theme", "layout.html"),
      [
        "<!doctype html>",
        "<html>",
        "<head>",
        "<title>{{title}}</title>",
        '<link rel="stylesheet" href="/styles.css">',
        "</head>",
        '<body class="custom-theme">',
        "<header>{{siteTitle}}</header>",
        "<main>{{content}}</main>",
        "</body>",
        "</html>",
      ].join("\n"),
    );
    await Bun.write(join(root, "theme", "styles.css"), "body { background: papayawhip; }\n");

    await buildSite({
      title: "Custom Reef",
      domain: "https://example.com",
      workspace: await createWorkspace(root),
    });

    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      'body class="custom-theme"',
    );
    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      "<header>Custom Reef</header>",
    );
    await expect(readFile(join(root, "dist", "styles.css"), "utf8")).resolves.toBe(
      "body { background: papayawhip; }\n",
    );
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-build-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  await Bun.write(join(root, "pages", ".keep"), "");
  return root;
}
