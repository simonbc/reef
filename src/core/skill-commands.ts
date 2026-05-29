import type { LoadedSkill } from "./skill-loader";
import type { ToolResult } from "../skill-api";

export type SkillCommandAction = "publish" | "update" | "setup";
export type SkillCommandPlatform = "wordpress" | "mastodon" | "github-pages";

export type SkillCommandInput = {
  action: SkillCommandAction;
  platform: SkillCommandPlatform;
  ref?: string;
  status?: "draft" | "publish";
  visibility?: "public" | "unlisted" | "private" | "direct";
  location?: "global" | "project";
};

export async function runSkillCommand(
  skills: LoadedSkill[],
  input: SkillCommandInput,
): Promise<string> {
  const skill = skills.find((candidate) => candidate.name === input.platform);
  if (!skill || skill.status !== "loaded") {
    throw new Error(`Skill not loaded: ${input.platform}`);
  }

  const { toolName, toolInput } = skillToolInput(input);
  const tool = skill.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`Tool not found: ${input.platform}_${toolName}`);
  }

  return toolResultText(await tool.run(toolInput, skill.context));
}

export function formatSkillCommandResult(
  input: SkillCommandInput,
  result: string,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify(
      {
        action: input.action,
        platform: input.platform,
        ref: input.ref,
        result,
      },
      null,
      2,
    );
  }

  return result;
}

function skillToolInput(input: SkillCommandInput): {
  toolName: string;
  toolInput: Record<string, unknown>;
} {
  if (input.action === "setup") {
    if (input.platform !== "wordpress") {
      throw new Error(`Setup is not implemented for ${input.platform}.`);
    }
    return {
      toolName: "setup_config",
      toolInput: { location: input.location ?? "global" },
    };
  }

  if (input.platform === "github-pages") {
    if (input.action !== "publish") {
      throw new Error("GitHub Pages supports publish, not update.");
    }
    return { toolName: "publish_site", toolInput: {} };
  }

  if (!input.ref) {
    throw new Error(`Usage: reef ${input.action} ${input.platform} <slug|path|number>`);
  }

  if (input.action === "publish") {
    return {
      toolName: "publish_post",
      toolInput: {
        path: input.ref,
        ...(input.platform === "wordpress" ? { status: input.status ?? "publish" } : {}),
        ...(input.platform === "mastodon" && input.visibility
          ? { visibility: input.visibility }
          : {}),
      },
    };
  }

  return {
    toolName: "update_post",
    toolInput: {
      path: input.ref,
      ...(input.platform === "wordpress" && input.status ? { status: input.status } : {}),
    },
  };
}

function toolResultText(result: ToolResult): string {
  return typeof result === "string" ? result : result.text;
}
