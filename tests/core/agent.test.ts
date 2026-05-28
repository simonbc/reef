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
});

function loadedSkill(input: {
  name: string;
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
        name: "ping",
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
