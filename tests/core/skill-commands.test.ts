import { describe, expect, test } from "bun:test";
import {
  formatSkillCommandResult,
  runSkillCommand,
  type SkillCommandInput,
} from "../../src/core/skill-commands";
import type { LoadedSkill } from "../../src/core/skill-loader";

describe("skill commands", () => {
  test("runs wordpress publish with a numbered ref", async () => {
    const calls: unknown[] = [];
    const result = await runSkillCommand(
      [loadedSkill("wordpress", "publish_post", async (input) => {
        calls.push(input);
        return "published";
      })],
      { action: "publish", platform: "wordpress", ref: "1" },
    );

    expect(result).toBe("published");
    expect(calls).toEqual([{ path: "1", status: "publish" }]);
  });

  test("runs wordpress update", async () => {
    const calls: unknown[] = [];
    await runSkillCommand(
      [loadedSkill("wordpress", "update_post", async (input) => {
        calls.push(input);
        return "updated";
      })],
      { action: "update", platform: "wordpress", ref: "posts/hello.md" },
    );

    expect(calls).toEqual([{ path: "posts/hello.md" }]);
  });

  test("runs github pages publish without a ref", async () => {
    const result = await runSkillCommand(
      [loadedSkill("github-pages", "publish_site", async () => "published site")],
      { action: "publish", platform: "github-pages" },
    );

    expect(result).toBe("published site");
  });

  test("formats json results", () => {
    const input: SkillCommandInput = {
      action: "publish",
      platform: "mastodon",
      ref: "1",
    };

    expect(JSON.parse(formatSkillCommandResult(input, "posted", { json: true }))).toEqual({
      action: "publish",
      platform: "mastodon",
      ref: "1",
      result: "posted",
    });
  });
});

function loadedSkill(
  name: string,
  toolName: string,
  run: (input: unknown) => Promise<string>,
): LoadedSkill {
  return {
    name,
    version: "0.1.0",
    status: "loaded",
    tools: [
      {
        name: toolName,
        description: "test",
        inputSchema: { type: "object" },
        run,
      },
    ],
    context: {
      config: {},
      secrets: {},
      workspace: {} as LoadedSkill["context"]["workspace"],
    },
  };
}
