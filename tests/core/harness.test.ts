import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarnessApp } from "../../src/core/harness";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createHarnessApp", () => {
  test("serves the live workspace app at the root", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });

    const shell = await app.fetch(new Request("http://reef.local/")).then((res) => res.text());
    expect(shell).toContain("Harness Reef");
    expect(shell).toContain("/posts/hello/");
    expect(shell).toContain("new EventSource('/__reef/events')");
  });

  test("exposes a browser event stream", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });
    const events = await app.fetch(new Request("http://reef.local/__reef/events"));
    const reader = events.body?.getReader();
    if (!reader) {
      throw new Error("events response did not include a stream");
    }

    const connected = new TextDecoder().decode((await reader.read()).value);
    expect(connected).toContain(": connected");
    await reader.cancel();
  });

  test("renders posts from markdown on request", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });

    const post = await app
      .fetch(new Request("http://reef.local/posts/hello/"))
      .then((res) => res.text());
    expect(post).toContain("<h1>Hello</h1>");
  });

  test("does not serve files outside the workspace content routes", async () => {
    const root = await tempRoot();
    const app = createHarnessApp({ root });

    const response = await app.fetch(new Request("http://reef.local/../reef.toml"));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain('title = "Harness Reef"');
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
