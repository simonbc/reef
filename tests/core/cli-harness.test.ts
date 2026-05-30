import { describe, expect, test } from "bun:test";
import { runCliHarness } from "../../src/core/cli-harness";

describe("runCliHarness", () => {
  test("prints a > prompt, renders agent output, and prompts again", async () => {
    const writes: string[] = [];
    const spinnerEvents: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["make it nicer", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async () => "# Done\n\n- Updated **post**",
      spinnerFactory: () => ({
        start: () => spinnerEvents.push("start"),
        stop: () => spinnerEvents.push("stop"),
      }),
    });

    expect(writes.join("")).toBe("> Done\n\n• Updated post\n> ");
    expect(spinnerEvents).toEqual(["start", "stop"]);
  });

  test("reports that build slash command is no longer available", async () => {
    const writes: string[] = [];
    const prompts: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["/build", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async (prompt) => {
        prompts.push(prompt);
        return "should not run";
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      "> Builds are no longer part of the local runtime. Reef serves markdown live.\n> ",
    );
    expect(prompts).toEqual([]);
  });

  test("supports open slash command without invoking the agent", async () => {
    const writes: string[] = [];
    const opened: unknown[] = [];
    const prompts: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["/open post hello", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async (prompt) => {
        prompts.push(prompt);
        return "should not run";
      },
      runOpen: async (args) => {
        expect(args).toEqual(["post", "hello"]);
        return { type: "file", path: "/tmp/reef/posts/hello.md" };
      },
      openTarget: (target) => {
        opened.push(target);
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe("> Opened /tmp/reef/posts/hello.md\n> ");
    expect(opened).toEqual([{ type: "file", path: "/tmp/reef/posts/hello.md" }]);
    expect(prompts).toEqual([]);
  });

  test("lists posts and pages for numbered opening", async () => {
    const writes: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["/posts", "/pages", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async () => "should not run",
      listPosts: async () => [
        {
          slug: "hello",
          path: "posts/hello.md",
          title: "Hello",
          date: "2026-05-29",
        },
      ],
      listPages: async () => [
        {
          slug: "about",
          path: "pages/about.md",
          title: "About",
        },
      ],
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      "> 1. Hello 2026-05-29 (posts/hello.md)\n> 1. About (pages/about.md)\n> ",
    );
  });

  test("passes prior turns as history for follow-up prompts", async () => {
    const calls: { prompt: string; history: unknown[] }[] = [];

    await runCliHarness({
      prompts: asyncLines(["make it nicer", "make it warmer", "exit"]),
      output: { write: () => {} },
      runPrompt: async (prompt, history) => {
        calls.push({ prompt, history });
        return `answer to ${prompt}`;
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(calls).toEqual([
      { prompt: "make it nicer", history: [] },
      {
        prompt: "make it warmer",
        history: [
          { role: "user", content: "make it nicer" },
          { role: "assistant", content: "answer to make it nicer" },
        ],
      },
    ]);
  });

  test("shows concise agent activity by default", async () => {
    const writes: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["make it nicer", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async (_prompt, _history, onEvent) => {
        onEvent({ type: "phase", message: "Loading skills" });
        onEvent({ type: "tool_start", name: "posts_read", input: {} });
        onEvent({ type: "tool_result", name: "posts_read", result: "post text" });
        return "Done";
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      ">   Loading skills...\n  posts.read...\n  posts.read done\nDone\n> ",
    );
  });

  test("supports debug mode for detailed agent activity", async () => {
    const writes: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["/debug on", "make it nicer", "/debug off", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async (_prompt, _history, onEvent) => {
        onEvent({
          type: "tool_start",
          name: "posts_update",
          input: { path: "posts/hello.md" },
        });
        onEvent({
          type: "tool_result",
          name: "posts_update",
          result: "Updated posts/hello.md",
        });
        return "Done";
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      '> Debug output on.\n>   tool posts_update {"path":"posts/hello.md"}\n  result posts_update Updated posts/hello.md\nDone\n> Debug output off.\n> ',
    );
  });
});

async function* asyncLines(lines: string[]): AsyncIterable<string> {
  for (const line of lines) {
    yield line;
  }
}
