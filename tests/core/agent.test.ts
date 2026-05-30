import { afterEach, describe, expect, test } from "bun:test";
import { runAgentOnce } from "../../src/core/agent";
import type { LoadedSkill } from "../../src/core/skill-loader";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("runAgentOnce", () => {
  test("sends namespaced skill tools and returns final assistant text", async () => {
    const requests: unknown[] = [];
    const toolCalls: unknown[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);

      if (requests.length === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "alpha_ping",
              input: { value: "hello" },
            },
          ],
        });
      }

      toolCalls.push(body.messages.at(-1).content[0]);
      return jsonResponse({
        content: [{ type: "text", text: "done" }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "ping alpha",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "alpha",
          toolRun: async (input) => {
            expect(input).toEqual({ value: "hello" });
            return { text: "pong" };
          },
        }),
      ],
    });

    expect(result).toBe("done");
    expect((requests[0] as { tools: { name: string }[] }).tools.map((tool) => tool.name)).toEqual([
      "alpha_ping",
    ]);
    expect(toolCalls).toEqual([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: "pong",
      },
    ]);
  });

  test("fails before network when Anthropic key is missing", async () => {
    await expect(
      runAgentOnce({
        prompt: "publish",
        model: "claude-test",
        skills: [],
      }),
    ).rejects.toThrow("Missing Anthropic API key");
  });

  test("returns tool errors to the model as tool_result errors", async () => {
    const toolResults: unknown[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      if (body.messages.length === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_error",
              name: "alpha_ping",
              input: {},
            },
          ],
        });
      }

      toolResults.push(body.messages.at(-1).content[0]);
      return jsonResponse({
        content: [{ type: "text", text: "handled" }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "ping alpha",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "alpha",
          toolRun: async () => {
            throw new Error("boom");
          },
        }),
      ],
    });

    expect(result).toBe("handled");
    expect(toolResults).toEqual([
      {
        type: "tool_result",
        tool_use_id: "toolu_error",
        content: "boom",
        is_error: true,
      },
    ]);
  });

  test("includes prior chat history before the current prompt", async () => {
    let requestBody: { messages: { role: string; content: unknown }[] } | null = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        content: [{ type: "text", text: "second answer" }],
      });
    }) as typeof fetch;

    await runAgentOnce({
      prompt: "make it warmer",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [],
      history: [
        { role: "user", content: "make it a notebook" },
        { role: "assistant", content: "Done. I updated the post." },
      ],
    });

    expect(requestBody?.messages).toEqual([
      { role: "user", content: "make it a notebook" },
      { role: "assistant", content: "Done. I updated the post." },
      { role: "user", content: "make it warmer" },
    ]);
  });

  test("emits observable tool events without exposing model internals", async () => {
    const events: unknown[] = [];
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "alpha_ping",
              input: { value: "hello" },
            },
          ],
        });
      }

      return jsonResponse({
        content: [{ type: "text", text: "done" }],
      });
    }) as typeof fetch;

    await runAgentOnce({
      prompt: "ping alpha",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "alpha",
          toolRun: async () => "pong",
        }),
      ],
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: "phase", message: "Asking model" },
      { type: "tool_start", name: "alpha_ping", input: { value: "hello" } },
      { type: "tool_result", name: "alpha_ping", result: "pong" },
      { type: "phase", message: "Asking model" },
    ]);
  });

  test("blocks publish tools when the current prompt does not ask to publish", async () => {
    let toolRan = false;
    let requestCount = 0;
    const toolResults: unknown[] = [];
    const events: unknown[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestCount += 1;
      const body = JSON.parse(String(init?.body));

      if (requestCount === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_publish",
              name: "wordpress_publish_post",
              input: { path: "1" },
            },
          ],
        });
      }

      toolResults.push(body.messages.at(-1).content[0]);
      return jsonResponse({
        content: [{ type: "text", text: "I updated the local design only." }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "change the design completely and make it fun and colorful",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "wordpress",
          toolName: "publish_post",
          toolRun: async () => {
            toolRan = true;
            return "published";
          },
        }),
      ],
      onEvent: (event) => events.push(event),
    });

    expect(result).toBe("I updated the local design only.");
    expect(toolRan).toBe(false);
    expect(toolResults).toEqual([
      {
        type: "tool_result",
        tool_use_id: "toolu_publish",
        content:
          "Blocked wordpress_publish_post. Remote write tools require an explicit publish/deploy/push/post/update request in the current prompt.",
        is_error: true,
      },
    ]);
    expect(events).toContainEqual({
      type: "tool_error",
      name: "wordpress_publish_post",
      error:
        "Blocked wordpress_publish_post. Remote write tools require an explicit publish/deploy/push/post/update request in the current prompt.",
    });
  });

  test("allows publish tools when the current prompt asks to publish", async () => {
    let toolRan = false;
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_publish",
              name: "wordpress_publish_post",
              input: { path: "1" },
            },
          ],
        });
      }

      return jsonResponse({
        content: [{ type: "text", text: "Published." }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "publish post 1 to wordpress",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "wordpress",
          toolName: "publish_post",
          toolRun: async () => {
            toolRan = true;
            return "published";
          },
        }),
      ],
    });

    expect(result).toBe("Published.");
    expect(toolRan).toBe(true);
  });

  test("allows publish tools when the current prompt says post a numbered item to a platform", async () => {
    let toolRan = false;
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_publish",
              name: "wordpress_publish_post",
              input: { path: "1" },
            },
          ],
        });
      }

      return jsonResponse({
        content: [{ type: "text", text: "Posted." }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "can you post 1 to wordpress?",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "wordpress",
          toolName: "publish_post",
          toolRun: async () => {
            toolRan = true;
            return "posted";
          },
        }),
      ],
    });

    expect(result).toBe("Posted.");
    expect(toolRan).toBe(true);
  });

  test("allows update tools when the current prompt asks to update a platform", async () => {
    let toolRan = false;
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return jsonResponse({
          content: [
            {
              type: "tool_use",
              id: "toolu_update",
              name: "wordpress_update_post",
              input: { path: "1" },
            },
          ],
        });
      }

      return jsonResponse({
        content: [{ type: "text", text: "Updated." }],
      });
    }) as typeof fetch;

    const result = await runAgentOnce({
      prompt: "i updated post 1, update it on wordpress",
      model: "claude-test",
      anthropicApiKey: "test-key",
      skills: [
        loadedSkill({
          name: "wordpress",
          toolName: "update_post",
          toolRun: async () => {
            toolRan = true;
            return "updated";
          },
        }),
      ],
    });

    expect(result).toBe("Updated.");
    expect(toolRan).toBe(true);
  });
});

function loadedSkill(input: {
  name: string;
  toolName?: string;
  toolRun: (input: unknown) => Promise<string | { text: string }>;
}): LoadedSkill {
  return {
    name: input.name,
    version: "0.1.0",
    status: "loaded",
    context: {
      config: {},
      secrets: {},
      workspace: {} as LoadedSkill["context"]["workspace"],
    },
    tools: [
      {
        name: input.toolName ?? "ping",
        description: "Ping test tool.",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
        },
        run: input.toolRun,
      },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
