import { afterEach, describe, expect, test } from "bun:test";
import wordpress from "../../skills/wordpress";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.REEF_WP_URL;
  delete process.env.REEF_WORDPRESS_USERNAME;
  delete process.env.REEF_WORDPRESS_APP_PASSWORD;
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
  });
});

function publishTool() {
  const tool = wordpress.tools.find((candidate) => candidate.name === "publish_post");
  if (!tool) {
    throw new Error("publish_post tool missing");
  }
  return tool;
}

function context(input: {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  markdown: string | null;
}): ToolContext {
  return {
    config: input.config,
    secrets: input.secrets,
    workspace: {
      readPost: async () => input.markdown,
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}
