import type { LoadedSkill } from "./skill-loader";
import type { ToolDef, ToolResult } from "../skill-api";

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type ContentBlock = TextBlock | ToolUseBlock;
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResultBlock[];
};
export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};
export type AgentEvent =
  | { type: "phase"; message: string }
  | { type: "tool_start"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "tool_error"; name: string; error: string };

const ANTHROPIC_VERSION = "2023-06-01";

export async function runAgentOnce(input: {
  prompt: string;
  skills: LoadedSkill[];
  anthropicApiKey?: string;
  model: string;
  history?: ChatTurn[];
  onEvent?: (event: AgentEvent) => void;
}): Promise<string> {
  if (!input.anthropicApiKey) {
    throw new Error(
      "Missing Anthropic API key. Set ANTHROPIC_API_KEY or anthropic_key_env in ~/.reef/config.toml or reef.toml.",
    );
  }

  const toolMap = buildToolMap(input.skills);
  const tools = [...toolMap.entries()].map(([name, item]) => ({
    name,
    description: item.tool.description,
    input_schema: item.tool.inputSchema,
  }));

  const messages: Message[] = [
    ...(input.history ?? []),
    { role: "user", content: input.prompt },
  ];
  const output: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    input.onEvent?.({ type: "phase", message: "Asking model" });
    const response = await anthropicMessage({
      apiKey: input.anthropicApiKey,
      model: input.model,
      system: systemPrompt(input.skills),
      tools,
      messages,
    });

    const content = response.content;
    messages.push({ role: "assistant", content });

    const text = content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (text) {
      output.push(text);
    }

    const toolUses = content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      break;
    }

    const results: ToolResultBlock[] = [];
    for (const toolUse of toolUses) {
      const item = toolMap.get(toolUse.name);
      if (!item) {
        input.onEvent?.({
          type: "tool_error",
          name: toolUse.name,
          error: `Unknown tool: ${toolUse.name}`,
        });
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      if (isPublishTool(toolUse.name) && !hasPublishIntent(input.prompt)) {
        const errorMessage = [
          `Blocked ${toolUse.name}.`,
          "Publishing requires an explicit publish/deploy/push request in the current prompt.",
        ].join(" ");
        input.onEvent?.({
          type: "tool_error",
          name: toolUse.name,
          error: errorMessage,
        });
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: errorMessage,
          is_error: true,
        });
        continue;
      }

      try {
        input.onEvent?.({
          type: "tool_start",
          name: toolUse.name,
          input: toolUse.input,
        });
        const result = await item.tool.run(toolUse.input, item.skill.context);
        const resultText = toolResultText(result);
        input.onEvent?.({
          type: "tool_result",
          name: toolUse.name,
          result: resultText,
        });
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultText,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        input.onEvent?.({
          type: "tool_error",
          name: toolUse.name,
          error: errorMessage,
        });
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: errorMessage,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: results });
  }

  return output.join("\n").trim();
}

function buildToolMap(skills: LoadedSkill[]): Map<
  string,
  { skill: LoadedSkill; tool: ToolDef }
> {
  const map = new Map<string, { skill: LoadedSkill; tool: ToolDef }>();

  for (const skill of skills) {
    if (skill.status !== "loaded") {
      continue;
    }

    for (const tool of skill.tools) {
      const name = `${skill.name}_${tool.name}`;
      if (name.length > 64) {
        continue;
      }
      map.set(name, { skill, tool });
    }
  }

  return map;
}

async function anthropicMessage(input: {
  apiKey: string;
  model: string;
  system: string;
  tools: unknown[];
  messages: Message[];
}): Promise<{ content: ContentBlock[] }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      system: input.system,
      tools: input.tools,
      messages: input.messages,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${JSON.stringify(json)}`);
  }

  return json as { content: ContentBlock[] };
}

function systemPrompt(skills: LoadedSkill[]): string {
  const fragments = skills
    .map((skill) => skill.systemPrompt)
    .filter((fragment): fragment is string => Boolean(fragment));

  return [
    "You are reef, a local programmable runtime for publishing markdown to the social web.",
    "Use the loaded tools to read local posts/pages and publish to configured endpoints.",
    "Publishing tools perform external side effects. Use them only when the current user prompt explicitly asks to publish, deploy, push, post to a platform, or create a remote draft.",
    "Be concise. When a publishing tool returns a live URL, show it to the user.",
    ...fragments,
  ].join("\n\n");
}

function toolResultText(result: ToolResult): string {
  return typeof result === "string" ? result : result.text;
}

function isPublishTool(name: string): boolean {
  return /\bpublish\b|publish_|_publish|deploy|push/.test(name);
}

function hasPublishIntent(prompt: string): boolean {
  return /\b(publish|deploy|push|ship|post\s+to|send\s+to|upload|create\s+(a\s+)?remote\s+draft|create\s+(a\s+)?draft)\b/i.test(
    prompt,
  ) || /\bpost\b.{0,80}\bto\b/i.test(prompt);
}
