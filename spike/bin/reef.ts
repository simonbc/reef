#!/usr/bin/env bun

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type ContentBlock = TextBlock | ToolUseBlock;
type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResultBlock[];
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-4-7";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error('Usage: bun run reef "publish posts/hello.md to my wordpress"');
  process.exit(1);
}

const requiredEnv = [
  "ANTHROPIC_API_KEY",
  "REEF_WP_URL",
  "REEF_WP_USERNAME",
  "REEF_WP_APP_PASSWORD",
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const tools = [
  {
    name: "wordpress_publish_post",
    description:
      "Publish a local markdown post to WordPress. Use this when the user asks to publish a markdown file, post, or article to WordPress. Returns the WordPress post URL.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to the markdown file relative to the current working directory, for example posts/hello.md.",
        },
        status: {
          type: "string",
          enum: ["draft", "publish"],
          description:
            "WordPress post status. Use publish when the user says publish; use draft if they explicitly ask for a draft.",
        },
      },
      required: ["path"],
    },
  },
];

const messages: Message[] = [
  {
    role: "user",
    content: prompt,
  },
];

for (let turn = 0; turn < 8; turn++) {
  const response = await anthropicMessage(messages);
  const content = response.content as ContentBlock[];
  messages.push({ role: "assistant", content });

  const text = content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (text) {
    console.log(text);
  }

  const toolUses = content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );

  if (toolUses.length === 0) {
    break;
  }

  const results: ToolResultBlock[] = [];
  for (const toolUse of toolUses) {
    try {
      const result = await runTool(toolUse.name, toolUse.input);
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    } catch (error) {
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: error instanceof Error ? error.message : String(error),
        is_error: true,
      });
    }
  }

  messages.push({ role: "user", content: results });
}

async function anthropicMessage(messages: Message[]) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
      max_tokens: 4096,
      system:
        "You are reef, a local publishing runtime. The user wants local markdown published to WordPress. If a suitable local markdown file is named or implied, call the WordPress publishing tool. Be concise.",
      tools,
      messages,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json as { content: ContentBlock[] };
}

async function runTool(name: string, input: unknown): Promise<string> {
  if (name !== "wordpress_publish_post") {
    throw new Error(`Unknown tool: ${name}`);
  }

  const parsed = parsePublishInput(input);
  return publishMarkdownToWordPress(parsed.path, parsed.status);
}

function parsePublishInput(input: unknown): { path: string; status: "draft" | "publish" } {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("Tool input requires a non-empty path string.");
  }

  const envStatus = process.env.REEF_WP_STATUS === "draft" ? "draft" : "publish";
  const status =
    record.status === "draft" || record.status === "publish"
      ? record.status
      : envStatus;

  return {
    path: record.path,
    status,
  };
}

async function publishMarkdownToWordPress(
  relativePath: string,
  status: "draft" | "publish",
): Promise<string> {
  const { fullPath, displayPath } = await resolveMarkdownPath(relativePath);
  const source = await readFile(fullPath, "utf8");
  const post = parseMarkdownPost(source, displayPath);
  const baseUrl = process.env.REEF_WP_URL!.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/wp-json/wp/v2/posts`;
  const credentials = btoa(
    `${process.env.REEF_WP_USERNAME!}:${process.env.REEF_WP_APP_PASSWORD!}`,
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: post.title,
      content: post.html,
      status,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`WordPress API error ${response.status}: ${JSON.stringify(json)}`);
  }

  const link = typeof json.link === "string" ? json.link : "(no link returned)";
  return `Published ${displayPath} to WordPress as ${status}: ${link}`;
}

async function resolveMarkdownPath(relativePath: string): Promise<{
  fullPath: string;
  displayPath: string;
}> {
  const candidates = [relativePath];

  if (relativePath.startsWith("spike/")) {
    candidates.push(relativePath.slice("spike/".length));
  } else {
    candidates.push(`spike/${relativePath}`);
  }

  for (const candidate of candidates) {
    const fullPath = resolve(process.cwd(), candidate);
    try {
      await access(fullPath);
      return { fullPath, displayPath: candidate };
    } catch {
      // Try the next repo-root/spike-root path shape.
    }
  }

  throw new Error(
    `Could not find markdown file '${relativePath}'. From repo root use 'spike/posts/hello.md'; from spike/ use 'posts/hello.md'.`,
  );
}

function parseMarkdownPost(source: string, fallbackPath: string): { title: string; html: string } {
  const { frontmatter, body } = splitFrontmatter(source);
  const title =
    frontmatter.title ??
    firstMarkdownHeading(body) ??
    fallbackPath.replace(/^.*\//, "").replace(/\.md$/, "");

  return {
    title,
    html: markdownToHtml(body),
  };
}

function splitFrontmatter(source: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source };
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: {}, body: source };
  }

  const raw = source.slice(4, end);
  const body = source.slice(end + 5);
  const frontmatter: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) {
      frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body };
}

function firstMarkdownHeading(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return html.join("\n");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text: string, href: string) =>
        `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`,
    );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
