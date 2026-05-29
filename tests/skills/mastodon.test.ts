import { afterEach, describe, expect, test } from "bun:test";
import mastodon from "../../skills/mastodon";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.REEF_MASTODON_ACCESS_TOKEN;
});

describe("mastodon skill", () => {
  test("publishes direct status text to the Mastodon statuses endpoint", async () => {
    const requests: { url: string; init?: RequestInit; body: Record<string, unknown> }[] = [];
    const createdPosts: { slug: string; date: string; body: string; title?: string }[] = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        init,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ url: "https://mastodon.example/@simon/1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await tool("publish_status").run(
      { status: "Hello from Reef", visibility: "unlisted" },
      context({
        config: { instance: "https://mastodon.example/" },
        secrets: { access_token: "test-token" },
        markdown: null,
        createPost: async (slug, date, body, title) => {
          createdPosts.push({ slug, date, body, title });
        },
      }),
    );

    expect(result).toBe(
      "Created posts/hello-from-reef.md and published it to Mastodon: https://mastodon.example/@simon/1",
    );
    expect(createdPosts).toEqual([
      {
        slug: "hello-from-reef",
        date: "2026-05-29",
        body: "Hello from Reef",
        title: "Hello from Reef",
      },
    ]);
    expect(requests[0].url).toBe("https://mastodon.example/api/v1/statuses");
    expect(requests[0].body).toEqual({
      status: "Hello from Reef",
      visibility: "unlisted",
    });
    expect(requests[0].init?.headers).toMatchObject({
      authorization: "Bearer test-token",
      "content-type": "application/json",
    });
  });

  test("publishes a markdown post as plain text", async () => {
    const requests: { body: Record<string, unknown> }[] = [];
    const stateWrites: { key: string; value: unknown }[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({
        id: "2",
        url: "https://mastodon.example/@simon/2",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await tool("publish_post").run(
      { path: "hello" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: { access_token: "test-token" },
        markdown:
          "---\ntitle: Hello Reef\n---\n\n# Hello Reef\n\nThis is **bold** and [linked](https://example.com).",
        stateWrites,
      }),
    );

    expect(result).toBe("Published hello to Mastodon: https://mastodon.example/@simon/2");
    expect(requests[0].body.status).toBe(
      "Hello Reef\n\nThis is bold and linked (https://example.com).",
    );
    expect(stateWrites).toEqual([
      {
        key: "post:hello",
        value: {
          id: "2",
          url: "https://mastodon.example/@simon/2",
        },
      },
    ]);
  });

  test("publishes numbered post selections from the current post list", async () => {
    const readPaths: string[] = [];

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        id: "2",
        url: "https://mastodon.example/@simon/2",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await tool("publish_post").run(
      { path: "1" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: { access_token: "test-token" },
        posts: [{ slug: "hello", path: "posts/hello.md", title: "Hello" }],
        markdown: "# Hello",
        readPost: async (path) => {
          readPaths.push(path);
          return "# Hello";
        },
      }),
    );

    expect(result).toBe("Published posts/hello.md to Mastodon: https://mastodon.example/@simon/2");
    expect(readPaths).toEqual(["posts/hello.md"]);
  });

  test("updates a previously published Mastodon status from markdown", async () => {
    const requests: { url: string; init?: RequestInit; body: Record<string, unknown> }[] = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        init,
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({
        id: "2",
        url: "https://mastodon.example/@simon/2",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await tool("update_post").run(
      { path: "hello" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: { access_token: "test-token" },
        markdown: "# Hello updated\n\nEdited body.",
        state: {
          "post:hello": {
            id: "2",
            url: "https://mastodon.example/@simon/2",
          },
        },
      }),
    );

    expect(result).toBe("Updated hello on Mastodon: https://mastodon.example/@simon/2");
    expect(requests[0].url).toBe("https://mastodon.example/api/v1/statuses/2");
    expect(requests[0].init?.method).toBe("PUT");
    expect(requests[0].body).toEqual({ status: "Hello updated\n\nEdited body." });
  });

  test("reports when a post has not been published to Mastodon before update", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await tool("update_post").run(
      { path: "hello" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: { access_token: "test-token" },
        markdown: "# Hello",
      }),
    );

    expect(result).toBe(
      "No Mastodon status is recorded for hello. Publish it to Mastodon first.",
    );
  });

  test("returns configuration guidance instead of publishing when token is missing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await tool("publish_status").run(
      { status: "Hello" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: {},
        markdown: null,
      }),
    );

    expect(String(result)).toContain("Skill 'mastodon' is not configured.");
    expect(String(result)).toContain("[mastodon].instance");
    expect(String(result)).toContain("REEF_MASTODON_INSTANCE");
    expect(String(result)).toContain("REEF_MASTODON_ACCESS_TOKEN");
  });

  test("rejects statuses over the configured character limit", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await tool("publish_status").run(
      { status: "hello world" },
      context({
        config: {
          instance: "https://mastodon.example",
          character_limit: 10,
        },
        secrets: { access_token: "test-token" },
        markdown: null,
      }),
    );

    expect(String(result)).toBe("Mastodon status is 11 characters, over the 10 character limit.");
  });

  test("reports missing posts without publishing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await tool("publish_post").run(
      { path: "missing" },
      context({
        config: { instance: "https://mastodon.example" },
        secrets: { access_token: "test-token" },
        markdown: null,
      }),
    );

    expect(result).toBe("Post not found: missing");
  });
});

function context(input: {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  posts?: Awaited<ReturnType<WorkspaceAPI["listPosts"]>>;
  markdown: string | null;
  readPost?: WorkspaceAPI["readPost"];
  createPost?: WorkspaceAPI["createPost"];
  state?: Record<string, unknown>;
  stateWrites?: { key: string; value: unknown }[];
}): ToolContext {
  return {
    config: input.config,
    secrets: input.secrets,
    workspace: {
      readPost: input.readPost ?? (async () => input.markdown),
      listPosts: async () => input.posts ?? [],
      createPost:
        input.createPost ??
        (async () => {
          throw new Error("createPost should not be called");
        }),
      skillState: {
        read: async (_skillName, key) => input.state?.[key] ?? null,
        write: async (_skillName, key, value) => {
          input.stateWrites?.push({ key, value });
        },
      },
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}

function tool(name: string) {
  const found = mastodon.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}
