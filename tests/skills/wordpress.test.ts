import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import wordpress from "../../skills/wordpress";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

const originalFetch = globalThis.fetch;
const roots: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.REEF_WP_URL;
  delete process.env.REEF_WORDPRESS_USERNAME;
  delete process.env.REEF_WORDPRESS_APP_PASSWORD;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("wordpress skill", () => {
  test("publishes markdown posts to the WordPress posts endpoint", async () => {
    const requests: { url: string; init?: RequestInit; body: Record<string, unknown> }[] = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        init,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ link: "https://example.com/hello/" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await publishTool().run(
      { path: "hello", status: "draft" },
      context({
        config: { url: "https://example.wordpress.com/" },
        secrets: { username: "simon", app_password: "app-pass" },
        markdown: "---\ntitle: Hello\n---\n\n# Hello\n\nBody",
      }),
    );

    expect(result).toBe("Published hello to WordPress as draft: https://example.com/hello/");
    expect(requests[0].url).toBe("https://example.wordpress.com/wp-json/wp/v2/posts");
    expect(requests[0].body).toMatchObject({
      title: "Hello",
      content: expect.stringContaining("<h1>Hello</h1>"),
      status: "draft",
    });
    expect(requests[0].init?.headers).toMatchObject({
      authorization: `Basic ${btoa("simon:app-pass")}`,
      "content-type": "application/json",
    });
  });

  test("publishes numbered post selections from the current post list", async () => {
    const readPaths: string[] = [];

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ link: "https://example.com/hello/" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await publishTool().run(
      { path: "1", status: "publish" },
      context({
        config: { url: "https://example.wordpress.com/" },
        secrets: { username: "simon", app_password: "app-pass" },
        posts: [{ slug: "hello", path: "posts/hello.md", title: "Hello" }],
        markdown: "# Hello",
        readPost: async (path) => {
          readPaths.push(path);
          return "# Hello";
        },
      }),
    );

    expect(result).toBe(
      "Published posts/hello.md to WordPress as publish: https://example.com/hello/",
    );
    expect(readPaths).toEqual(["posts/hello.md"]);
  });

  test("publishes with credentials filled into config", async () => {
    const requests: { init?: RequestInit }[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push({ init });
      return new Response(JSON.stringify({ link: "https://example.com/hello/" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await publishTool().run(
      { path: "hello", status: "publish" },
      context({
        config: {
          url: "https://example.wordpress.com/",
          username: "simon",
          app_password: "app-pass",
        },
        secrets: {},
        markdown: "# Hello",
      }),
    );

    expect(requests[0].init?.headers).toMatchObject({
      authorization: `Basic ${btoa("simon:app-pass")}`,
    });
  });

  test("creates a global fill-in config template", async () => {
    const root = await tempRoot();
    const configPath = join(root, ".reef", "config.toml");

    const result = await tool("setup_config").run(
      {},
      context({
        config: { __global_config_path: configPath },
        secrets: {},
        markdown: null,
      }),
    );

    await expect(readFile(configPath, "utf8")).resolves.toBe(
      [
        "[wordpress]",
        'url = "https://your-site.wordpress.com"',
        'username = "your-wordpress-username"',
        'app_password = "your-wordpress-application-password"',
        "",
      ].join("\n"),
    );
    expect(String(result)).toContain("Created WordPress config template");
    expect(String(result)).toContain(configPath);
  });

  test("returns configuration guidance instead of publishing when secrets are missing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await publishTool().run(
      { path: "hello" },
      context({
        config: { url: "https://example.wordpress.com" },
        secrets: {},
        markdown: "# Hello",
      }),
    );

    expect(String(result)).toContain("Skill 'wordpress' is not configured.");
    expect(String(result)).toContain("fill-in template");
    expect(String(result)).toContain("[wordpress].url");
    expect(String(result)).toContain("username");
    expect(String(result)).toContain("app_password");
    expect(String(result)).toContain("REEF_WP_URL");
    expect(String(result)).toContain("REEF_WORDPRESS_USERNAME");
    expect(String(result)).toContain("REEF_WORDPRESS_APP_PASSWORD");
    expect(String(result)).not.toContain("REEFWPURL");
    expect(String(result)).not.toContain("REEFWORDPRESSUSERNAME");
  });
});

function publishTool() {
  return tool("publish_post");
}

function tool(name: string) {
  const found = wordpress.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function context(input: {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  posts?: Awaited<ReturnType<WorkspaceAPI["listPosts"]>>;
  markdown: string | null;
  readPost?: WorkspaceAPI["readPost"];
}): ToolContext {
  return {
    config: input.config,
    secrets: input.secrets,
    workspace: {
      listPosts: async () => input.posts ?? [],
      readPost: input.readPost ?? (async () => input.markdown),
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-wordpress-"));
  roots.push(root);
  return root;
}
