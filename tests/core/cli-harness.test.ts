import { describe, expect, test } from "bun:test";
import { runCliHarness } from "../../src/core/cli-harness";

describe("runCliHarness", () => {
  test("prints a > prompt, renders agent output, and prompts again", async () => {
    const writes: string[] = [];
    const spinnerEvents: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["make it nicer", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async () => "# Done\n\n- Updated **theme**",
      spinnerFactory: () => ({
        start: () => spinnerEvents.push("start"),
        stop: () => spinnerEvents.push("stop"),
      }),
    });

    expect(writes.join("")).toBe("> Done\n\n• Updated theme\n> ");
    expect(spinnerEvents).toEqual(["start", "stop"]);
  });

  test("supports build slash command without invoking the agent", async () => {
    const writes: string[] = [];
    const prompts: string[] = [];

    await runCliHarness({
      prompts: asyncLines(["/build", "exit"]),
      output: { write: (chunk) => writes.push(chunk) },
      runPrompt: async (prompt) => {
        prompts.push(prompt);
        return "should not run";
      },
      runBuild: async () => "Built 4 files into dist/.",
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe("> Built 4 files into dist/.\n> ");
    expect(prompts).toEqual([]);
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
        onEvent({ type: "tool_start", name: "theme_read", input: {} });
        onEvent({ type: "tool_result", name: "theme_read", result: "theme text" });
        return "Done";
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      ">   Loading skills...\n  theme.read...\n  theme.read done\nDone\n> ",
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
          name: "theme_update_css",
          input: { path: "theme/styles.css" },
        });
        onEvent({
          type: "tool_result",
          name: "theme_update_css",
          result: "Updated theme/styles.css",
        });
        return "Done";
      },
      spinnerFactory: () => ({
        start: () => {},
        stop: () => {},
      }),
    });

    expect(writes.join("")).toBe(
      '> Debug output on.\n>   tool theme_update_css {"path":"theme/styles.css"}\n  result theme_update_css Updated theme/styles.css\nDone\n> Debug output off.\n> ',
    );
  });
});

async function* asyncLines(lines: string[]): AsyncIterable<string> {
  for (const line of lines) {
    yield line;
  }
}
