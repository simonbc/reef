import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarnessApp } from "../../src/core/harness";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createHarnessApp", () => {
  test("serves the built site at the root", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });
    await app.fetch(new Request("http://reef.local/__reef/build", { method: "POST" }));

    const shell = await app.fetch(new Request("http://reef.local/")).then((res) => res.text());
    expect(shell).toContain("Harness Reef");
    expect(shell).toContain("/posts/hello/");
  });

  test("build endpoint writes dist for the terminal harness", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });

    const build = await app
      .fetch(new Request("http://reef.local/__reef/build", { method: "POST" }))
      .then((res) => res.json());

    expect(build).toMatchObject({ ok: true, files: expect.arrayContaining(["dist/index.html"]) });
    await expect(readFile(join(root, "dist", "index.html"), "utf8")).resolves.toContain(
      "Harness Reef",
    );

    const post = await app
      .fetch(new Request("http://reef.local/posts/hello/"))
      .then((res) => res.text());
    expect(post).toContain("<h1>Hello</h1>");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-harness-"));
  roots.push(root);
  await writeFile(
    join(root, "reef.toml"),
    'title = "Harness Reef"\ndomain = "https://example.com"\n',
  );
  await Bun.write(join(root, "posts", ".keep"), "");
  await writeFile(
    join(root, "posts", "hello.md"),
    "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n\nBody.",
  );
  return root;
}
