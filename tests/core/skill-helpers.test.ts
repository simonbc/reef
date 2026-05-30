import { afterEach, describe, expect, test } from "bun:test";
import {
  appendConfigTemplate,
  configString,
  fetchJson,
  isPublishedState,
  parseSetupInput,
  postStateKey,
  resolvePostPath,
  skillConfigPath,
} from "../../src/core/skill-helpers";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("skill helpers", () => {
  test("parses setup locations and resolves config paths", () => {
    const ctx = {
      config: { __global_config_path: "/tmp/global.toml" },
      workspace: { root: "/tmp/site" },
    };

    expect(parseSetupInput({ location: "project" })).toEqual({ location: "project" });
    expect(parseSetupInput({ location: "bad" })).toEqual({ location: "global" });
    expect(skillConfigPath(ctx, "project")).toBe("/tmp/site/reef.toml");
    expect(skillConfigPath(ctx, "global")).toBe("/tmp/global.toml");
  });

  test("appends config templates with stable spacing", () => {
    expect(appendConfigTemplate("", "[wordpress]\n")).toBe("[wordpress]\n");
    expect(appendConfigTemplate('title = "Site"\n', "[wordpress]\n")).toBe(
      'title = "Site"\n\n[wordpress]\n',
    );
  });

  test("resolves numbered post paths", async () => {
    await expect(
      resolvePostPath("1", {
        workspace: { listPosts: async () => [{ path: "posts/hello.md" }] },
      }),
    ).resolves.toBe("posts/hello.md");
    await expect(
      resolvePostPath("hello", {
        workspace: { listPosts: async () => [] },
      }),
    ).resolves.toBe("hello");
  });

  test("normalizes config strings and post state", () => {
    expect(configString(" value ")).toBe(" value ");
    expect(configString("")).toBeUndefined();
    expect(postStateKey("posts/hello.md")).toBe("post:hello");
    expect(postStateKey("hello")).toBe("post:hello");
    expect(isPublishedState({ id: "1", url: "https://example.com" })).toBe(true);
    expect(isPublishedState({ id: 1, url: "https://example.com" })).toBe(false);
  });

  test("fetches json and wraps API errors with a connector label", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "bad" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await expect(fetchJson("WordPress", "https://example.com", {})).rejects.toThrow(
      'WordPress API error 400: {"error":"bad"}',
    );
  });
});
