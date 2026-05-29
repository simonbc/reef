import { defineSkill, defineTool } from "../../src/skill-api";
import { parseMarkdown } from "../../src/core/markdown";

type Visibility = "public" | "unlisted" | "private" | "direct";

const DEFAULT_ACCESS_TOKEN_ENV = "REEF_MASTODON_ACCESS_TOKEN";
const DEFAULT_CHARACTER_LIMIT = 500;

export default defineSkill({
  name: "mastodon",
  systemPrompt:
    "Mastodon publishing posts statuses to a configured instance. Publish only when the user explicitly asks to post, publish, or send to Mastodon.",
  tools: [
    defineTool({
      name: "publish_status",
      description:
        "Publish direct text as a Mastodon status. Requires mastodon.instance and an access token.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Plain text status to publish to Mastodon.",
          },
          visibility: {
            type: "string",
            enum: ["public", "unlisted", "private", "direct"],
            description: "Mastodon visibility. Defaults to public.",
          },
        },
        required: ["status"],
      },
      run: async (input, ctx) => {
        const parsed = parseStatusInput(input);
        const config = mastodonConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const limit = characterLimit(ctx.config);
        if (parsed.status.length > limit) {
          return overLimitMessage(parsed.status, limit);
        }

        const slug = statusSlug(parsed.status);
        const date = todayIsoDate();
        await ctx.workspace.createPost(slug, date, parsed.status, titleFromStatus(parsed.status));

        const url = await publishToMastodon({
          instance: config.instance,
          accessToken: config.accessToken,
          status: parsed.status,
          visibility: parsed.visibility,
        });

        return `Created posts/${slug}.md and published it to Mastodon: ${url}`;
      },
    }),
    defineTool({
      name: "publish_post",
      description:
        "Publish a local markdown post to Mastodon as plain text. Requires mastodon.instance and an access token.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Post slug or path, for example hello or posts/hello.md.",
          },
          visibility: {
            type: "string",
            enum: ["public", "unlisted", "private", "direct"],
            description: "Mastodon visibility. Defaults to public.",
          },
        },
        required: ["path"],
      },
      run: async (input, ctx) => {
        const parsed = parsePostInput(input);
        const markdown = await ctx.workspace.readPost(parsed.path);
        if (!markdown) {
          return `Post not found: ${parsed.path}`;
        }

        const config = mastodonConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const post = parseMarkdown(markdown, parsed.path);
        const status = markdownToPlainText(post.body);
        const limit = characterLimit(ctx.config);
        if (status.length > limit) {
          return overLimitMessage(status, limit);
        }

        const url = await publishToMastodon({
          instance: config.instance,
          accessToken: config.accessToken,
          status,
          visibility: parsed.visibility,
        });

        return `Published ${parsed.path} to Mastodon: ${url}`;
      },
    }),
  ],
});

function parseStatusInput(input: unknown): { status: string; visibility: Visibility } {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.status !== "string" || record.status.trim() === "") {
    throw new Error("Tool input requires status.");
  }

  return {
    status: record.status.trim(),
    visibility: parseVisibility(record.visibility),
  };
}

function parsePostInput(input: unknown): { path: string; visibility: Visibility } {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("Tool input requires path.");
  }

  return {
    path: record.path.trim(),
    visibility: parseVisibility(record.visibility),
  };
}

function parseVisibility(value: unknown): Visibility {
  return value === "unlisted" || value === "private" || value === "direct"
    ? value
    : "public";
}

function mastodonConfig(
  config: Record<string, unknown>,
  secrets: Record<string, string>,
):
  | { ok: true; instance: string; accessToken: string }
  | { ok: false; message: string } {
  const instance = configString(config.instance) ?? process.env.REEF_MASTODON_INSTANCE;
  const accessTokenEnv = configString(config.access_token_env) ?? DEFAULT_ACCESS_TOKEN_ENV;
  const accessToken = secrets.access_token ?? process.env[accessTokenEnv];

  if (!instance || !accessToken) {
    return {
      ok: false,
      message: [
        "Skill 'mastodon' is not configured.",
        `Set [mastodon].instance and ${accessTokenEnv}.`,
      ].join(" "),
    };
  }

  return { ok: true, instance, accessToken };
}

async function publishToMastodon(input: {
  instance: string;
  accessToken: string;
  status: string;
  visibility: Visibility;
}): Promise<string> {
  const baseUrl = input.instance.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/statuses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: input.status,
      visibility: input.visibility,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Mastodon API error ${response.status}: ${JSON.stringify(json)}`);
  }

  return typeof json.url === "string" ? json.url : "(no URL returned)";
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function overLimitMessage(status: string, limit: number): string {
  return `Mastodon status is ${status.length} characters, over the ${limit} character limit.`;
}

function characterLimit(config: Record<string, unknown>): number {
  return typeof config.character_limit === "number" && Number.isFinite(config.character_limit)
    ? config.character_limit
    : DEFAULT_CHARACTER_LIMIT;
}

function configString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function statusSlug(status: string): string {
  const slug = status
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug || `post-${Date.now()}`;
}

function titleFromStatus(status: string): string {
  const firstLine = status.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Mastodon post";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
