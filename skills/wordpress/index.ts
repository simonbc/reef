import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defineSkill, defineTool } from "../../src/skill-api";
import { parseMarkdown } from "../../src/core/markdown";
import {
  appendConfigTemplate,
  configString,
  fetchJson,
  isPublishedState,
  parseSetupInput,
  postStateKey,
  readOptionalFile,
  resolvePostPath,
  skillConfigPath,
  type SetupLocation,
} from "../../src/core/skill-helpers";

type PublishInput = {
  path: string;
  status: "draft" | "publish";
};

type UpdateInput = {
  path: string;
  status?: "draft" | "publish";
};

export default defineSkill({
  name: "wordpress",
  systemPrompt:
    [
      "WordPress publishing uses the WordPress REST API.",
      "Publish only when the user asks to publish or create a draft.",
      "Use wordpress_update_post when the user asks to update, edit, republish, or sync a local post that Reef previously published to WordPress.",
      "WordPress configuration uses [wordpress].url, username, and app_password, or the REEF_WORDPRESS_USERNAME and REEF_WORDPRESS_APP_PASSWORD environment variables.",
      "If you mention fallback environment variables, use the exact name REEF_WP_URL.",
      "If WordPress is not configured, ask whether to create a fill-in config template. Use wordpress_setup_config when the user asks to set up WordPress or agrees to create the template.",
    ].join(" "),
  tools: [
    defineTool({
      name: "setup_config",
      description:
        "Create a fill-in WordPress config template. Defaults to ~/.reef/config.toml so it can be reused across Reef projects.",
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
        const target = skillConfigPath(ctx, parsed.location);
        const existing = await readOptionalFile(target);
        if (/\[wordpress\]/.test(existing)) {
          return `WordPress config already exists in ${target}. Fill in the values there.`;
        }

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, appendWordPressTemplate(existing, parsed.location));
        return [
          `Created WordPress config template in ${target}.`,
          "Fill in [wordpress].url, username, and app_password, then try publishing again.",
        ].join(" ");
      },
    }),
    defineTool({
      name: "publish_post",
      description:
        "Publish a local markdown post to WordPress. Requires [wordpress].url plus username/app_password in global config or REEF_WORDPRESS_USERNAME and REEF_WORDPRESS_APP_PASSWORD. Returns the WordPress post URL.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Post slug or path, for example hello or posts/hello.md.",
          },
          status: {
            type: "string",
            enum: ["draft", "publish"],
            description:
              "WordPress status. Use publish when the user says publish; use draft when explicitly requested.",
          },
        },
        required: ["path"],
      },
      run: async (input, ctx) => {
        const parsed = parsePublishInput(input);
        const path = await resolvePostPath(parsed.path, ctx);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }

        const config = wordpressConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const post = parseMarkdown(markdown, path);
        const published = await publishToWordPress({
          url: config.url,
          username: config.username,
          appPassword: config.appPassword,
          title: post.title ?? path,
          html: post.html,
          status: parsed.status,
        });
        await ctx.workspace.skillState.write("wordpress", postStateKey(path), {
          id: published.id,
          url: published.url,
        });

        return `Published ${path} to WordPress as ${parsed.status}: ${published.url}`;
      },
    }),
    defineTool({
      name: "update_post",
      description:
        "Update a previously published WordPress post from a local markdown post. Requires that the post was first published by Reef and has a recorded WordPress post id.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Post slug or path, for example hello or posts/hello.md.",
          },
          status: {
            type: "string",
            enum: ["draft", "publish"],
            description:
              "Optional WordPress status change. Omit this when only updating content.",
          },
        },
        required: ["path"],
      },
      run: async (input, ctx) => {
        const parsed = parseUpdateInput(input);
        const path = await resolvePostPath(parsed.path, ctx);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }

        const state = await ctx.workspace.skillState.read("wordpress", postStateKey(path));
        if (!isPublishedState(state)) {
          return `No WordPress post is recorded for ${path}. Publish it to WordPress first.`;
        }

        const config = wordpressConfig(ctx.config, ctx.secrets);
        if (!config.ok) {
          return config.message;
        }

        const post = parseMarkdown(markdown, path);
        const updated = await updateWordPressPost({
          url: config.url,
          username: config.username,
          appPassword: config.appPassword,
          id: state.id,
          title: post.title ?? path,
          html: post.html,
          status: parsed.status,
        });
        await ctx.workspace.skillState.write("wordpress", postStateKey(path), {
          id: updated.id,
          url: updated.url,
        });

        return `Updated ${path} on WordPress: ${updated.url}`;
      },
    }),
  ],
});

function wordpressConfig(
  config: Record<string, unknown>,
  secrets: Record<string, string>,
):
  | { ok: true; url: string; username: string; appPassword: string }
  | { ok: false; message: string } {
  const url = configString(config.url) ?? process.env.REEF_WP_URL;
  const usernameEnv = configString(config.username_env) ?? "REEF_WORDPRESS_USERNAME";
  const appPasswordEnv =
    configString(config.app_password_env) ?? "REEF_WORDPRESS_APP_PASSWORD";
  const username =
    secrets.username ?? configString(config.username) ?? process.env[usernameEnv];
  const appPassword =
    secrets.app_password ?? configString(config.app_password) ?? process.env[appPasswordEnv];

  if (!url || !username || !appPassword) {
    return { ok: false, message: wordpressConfigMessage() };
  }

  return { ok: true, url, username, appPassword };
}

function wordpressConfigMessage(): string {
  return [
    "Skill 'wordpress' is not configured.",
    "I can create a fill-in template in ~/.reef/config.toml if you want.",
    "Needed values: [wordpress].url, username, and app_password.",
    "Environment variables are also supported: REEF_WP_URL, REEF_WORDPRESS_USERNAME, and REEF_WORDPRESS_APP_PASSWORD.",
  ].join(" ");
}

function appendWordPressTemplate(existing: string, location: SetupLocation): string {
  const template =
    location === "global"
      ? [
          "[wordpress]",
          'url = "https://your-site.wordpress.com"',
          'username = "your-wordpress-username"',
          'app_password = "your-wordpress-application-password"',
          "",
        ].join("\n")
      : [
          "[wordpress]",
          'url = "https://your-site.wordpress.com"',
          "",
        ].join("\n");

  return appendConfigTemplate(existing, template);
}

function parsePublishInput(input: unknown): PublishInput {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("Tool input requires path.");
  }

  const status =
    record.status === "draft" || record.status === "publish"
      ? record.status
      : "publish";

  return {
    path: record.path.trim(),
    status,
  };
}

function parseUpdateInput(input: unknown): UpdateInput {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.path !== "string" || record.path.trim() === "") {
    throw new Error("Tool input requires path.");
  }

  return {
    path: record.path.trim(),
    status:
      record.status === "draft" || record.status === "publish" ? record.status : undefined,
  };
}

async function publishToWordPress(input: {
  url: string;
  username: string;
  appPassword: string;
  title: string;
  html: string;
  status: "draft" | "publish";
}): Promise<{ id: string; url: string }> {
  const baseUrl = input.url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/wp-json/wp/v2/posts`;
  const credentials = btoa(`${input.username}:${input.appPassword}`);

  const json = await fetchJson("WordPress", endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.html,
      status: input.status,
    }),
  });

  return wordpressPostResult(json, "");
}

async function updateWordPressPost(input: {
  url: string;
  username: string;
  appPassword: string;
  id: string;
  title: string;
  html: string;
  status?: "draft" | "publish";
}): Promise<{ id: string; url: string }> {
  const baseUrl = input.url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/wp-json/wp/v2/posts/${input.id}`;
  const credentials = btoa(`${input.username}:${input.appPassword}`);
  const body: Record<string, unknown> = {
    title: input.title,
    content: input.html,
  };

  if (input.status) {
    body.status = input.status;
  }

  const json = await fetchJson("WordPress", endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return wordpressPostResult(json, input.id);
}

function wordpressPostResult(json: unknown, fallbackId: string): { id: string; url: string } {
  const record = typeof json === "object" && json ? (json as Record<string, unknown>) : {};
  return {
    id:
      typeof record.id === "number" || typeof record.id === "string"
        ? String(record.id)
        : fallbackId,
    url: typeof record.link === "string" ? record.link : "(no link returned)",
  };
}
