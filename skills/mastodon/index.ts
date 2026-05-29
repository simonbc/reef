import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineSkill, defineTool } from "../../src/skill-api";
import { parseMarkdown } from "../../src/core/markdown";

type Visibility = "public" | "unlisted" | "private" | "direct";
type SetupInput = { location: "global" | "project" };

const DEFAULT_ACCESS_TOKEN_ENV = "REEF_MASTODON_ACCESS_TOKEN";
const DEFAULT_CHARACTER_LIMIT = 500;

export default defineSkill({
  name: "mastodon",
  systemPrompt:
    [
      "Mastodon publishing posts statuses to a configured instance.",
      "Publish only when the user explicitly asks to post, publish, or send to Mastodon.",
      "Direct Mastodon status prompts must create local markdown first, then publish that canonical source.",
      "Use mastodon_update_post when the user asks to update, edit, republish, or sync a local post that Reef previously published to Mastodon.",
      "Mastodon configuration uses [mastodon].instance and REEF_MASTODON_ACCESS_TOKEN by default.",
      "Use mastodon_setup_config when the user asks to set up Mastodon or agrees to create the template.",
    ].join(" "),
  tools: [
    defineTool({
      name: "setup_config",
      description:
        "Create a fill-in Mastodon config template. Defaults to ~/.reef/config.toml so it can be reused across Reef projects.",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            enum: ["global", "project"],
            description:
              "Where to write the template. Use global for ~/.reef/config.toml; use project for ./reef.toml.",
          },
        },
      },
      run: async (input, ctx) => {
        const parsed = parseSetupInput(input);
        const target = mastodonConfigPath(ctx, parsed.location);
        const existing = await readOptionalFile(target);
        if (/\[mastodon\]/.test(existing)) {
          return `Mastodon config already exists in ${target}. Fill in the values there.`;
        }

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, appendMastodonTemplate(existing));
        return [
          `Created Mastodon config template in ${target}.`,
          "Fill in [mastodon].instance and set REEF_MASTODON_ACCESS_TOKEN, then try publishing again.",
        ].join(" ");
      },
    }),
    defineTool({
      name: "publish_status",
      description:
        "Create a local markdown post from direct text, then publish it as a Mastodon status. Requires [mastodon].instance and REEF_MASTODON_ACCESS_TOKEN by default.",
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

        const published = await publishToMastodon({
          instance: config.instance,
          accessToken: config.accessToken,
          status: parsed.status,
          visibility: parsed.visibility,
        });
        await ctx.workspace.skillState.write("mastodon", stateKey(slug), {
          id: published.id,
          url: published.url,
        });

        return `Created posts/${slug}.md and published it to Mastodon: ${published.url}`;
      },
    }),
    defineTool({
      name: "publish_post",
      description:
        "Publish a local markdown post to Mastodon as plain text. Requires [mastodon].instance and REEF_MASTODON_ACCESS_TOKEN by default.",
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
        const path = await resolvePostPath(parsed.path, ctx);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }

        const config = mastodonConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const post = parseMarkdown(markdown, path);
        const status = markdownToPlainText(post.body);
        const limit = characterLimit(ctx.config);
        if (status.length > limit) {
          return overLimitMessage(status, limit);
        }

        const published = await publishToMastodon({
          instance: config.instance,
          accessToken: config.accessToken,
          status,
          visibility: parsed.visibility,
        });
        await ctx.workspace.skillState.write("mastodon", stateKey(path), {
          id: published.id,
          url: published.url,
        });

        return `Published ${path} to Mastodon: ${published.url}`;
      },
    }),
    defineTool({
      name: "update_post",
      description:
        "Update a previously published Mastodon status from a local markdown post. Requires that the post was first published by Reef and has a recorded Mastodon status id.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Post slug or path, for example hello or posts/hello.md.",
          },
        },
        required: ["path"],
      },
      run: async (input, ctx) => {
        const parsed = parsePostInput(input);
        const path = await resolvePostPath(parsed.path, ctx);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }

        const state = await ctx.workspace.skillState.read("mastodon", stateKey(path));
        if (!isPublishedState(state)) {
          return `No Mastodon status is recorded for ${path}. Publish it to Mastodon first.`;
        }

        const config = mastodonConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const post = parseMarkdown(markdown, path);
        const status = markdownToPlainText(post.body);
        const limit = characterLimit(ctx.config);
        if (status.length > limit) {
          return overLimitMessage(status, limit);
        }

        const updated = await updateMastodonStatus({
          instance: config.instance,
          accessToken: config.accessToken,
          id: state.id,
          status,
        });
        await ctx.workspace.skillState.write("mastodon", stateKey(path), {
          id: updated.id,
          url: updated.url,
        });

        return `Updated ${path} on Mastodon: ${updated.url}`;
      },
    }),
  ],
});

function parseSetupInput(input: unknown): SetupInput {
  if (!input || typeof input !== "object") {
    return { location: "global" };
  }

  const location = (input as Record<string, unknown>).location;
  return {
    location: location === "project" ? "project" : "global",
  };
}

function mastodonConfigPath(
  ctx: { config: Record<string, unknown>; workspace: { root: string } },
  location: "global" | "project",
): string {
  if (location === "project") {
    return join(ctx.workspace.root, "reef.toml");
  }

  return configString(ctx.config.__global_config_path) ?? join(homedir(), ".reef", "config.toml");
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function appendMastodonTemplate(existing: string): string {
  const template = [
    "[mastodon]",
    'instance = "https://mastodon.social"',
    'access_token_env = "REEF_MASTODON_ACCESS_TOKEN"',
    "",
  ].join("\n");

  return existing.trim() ? `${existing.replace(/\s*$/, "\n\n")}${template}` : template;
}

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

async function resolvePostPath(
  path: string,
  ctx: { workspace: { listPosts(): Promise<{ path: string }[]> } },
): Promise<string> {
  if (!/^\d+$/.test(path)) {
    return path;
  }

  const index = Number(path) - 1;
  const posts = await ctx.workspace.listPosts();
  return posts[index]?.path ?? path;
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
      message: mastodonConfigMessage(accessTokenEnv),
    };
  }

  return { ok: true, instance, accessToken };
}

function mastodonConfigMessage(accessTokenEnv: string): string {
  return [
    "Skill 'mastodon' is not configured.",
    "Set [mastodon].instance in reef.toml or ~/.reef/config.toml, or set REEF_MASTODON_INSTANCE.",
    `Set ${accessTokenEnv}.`,
  ].join(" ");
}

async function publishToMastodon(input: {
  instance: string;
  accessToken: string;
  status: string;
  visibility: Visibility;
}): Promise<{ id: string; url: string }> {
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

  return {
    id: typeof json.id === "string" ? json.id : "",
    url: typeof json.url === "string" ? json.url : "(no URL returned)",
  };
}

async function updateMastodonStatus(input: {
  instance: string;
  accessToken: string;
  id: string;
  status: string;
}): Promise<{ id: string; url: string }> {
  const baseUrl = input.instance.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/statuses/${input.id}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: input.status,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Mastodon API error ${response.status}: ${JSON.stringify(json)}`);
  }

  return {
    id: typeof json.id === "string" ? json.id : input.id,
    url: typeof json.url === "string" ? json.url : "(no URL returned)",
  };
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

function stateKey(path: string): string {
  return `post:${path.replace(/^posts\//, "").replace(/\.md$/, "")}`;
}

function isPublishedState(value: unknown): value is { id: string; url: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).url === "string"
  );
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
