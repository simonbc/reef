import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineSkill, defineTool } from "../../src/skill-api";
import { parseMarkdown } from "../../src/core/markdown";

type PublishInput = {
  path: string;
  status: "draft" | "publish";
};

type SetupInput = {
  location: "global" | "project";
};

export default defineSkill({
  name: "wordpress",
  systemPrompt:
    [
      "WordPress publishing uses the WordPress REST API.",
      "Publish only when the user asks to publish or create a draft.",
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
        const target = wordpressConfigPath(ctx, parsed.location);
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

        const url = configString(ctx.config.url) ?? process.env.REEF_WP_URL;
        const usernameEnv = configString(ctx.config.username_env) ?? "REEF_WORDPRESS_USERNAME";
        const appPasswordEnv =
          configString(ctx.config.app_password_env) ?? "REEF_WORDPRESS_APP_PASSWORD";
        const username =
          ctx.secrets.username ?? configString(ctx.config.username) ?? process.env[usernameEnv];
        const appPassword =
          ctx.secrets.app_password ??
          configString(ctx.config.app_password) ??
          process.env[appPasswordEnv];

        if (!url || !username || !appPassword) {
          return wordpressConfigMessage();
        }

        const post = parseMarkdown(markdown, path);
        const link = await publishToWordPress({
          url,
          username,
          appPassword,
          title: post.title ?? path,
          html: post.html,
          status: parsed.status,
        });

        return `Published ${path} to WordPress as ${parsed.status}: ${link}`;
      },
    }),
  ],
});

function wordpressConfigMessage(): string {
  return [
    "Skill 'wordpress' is not configured.",
    "I can create a fill-in template in ~/.reef/config.toml if you want.",
    "Needed values: [wordpress].url, username, and app_password.",
    "Environment variables are also supported: REEF_WP_URL, REEF_WORDPRESS_USERNAME, and REEF_WORDPRESS_APP_PASSWORD.",
  ].join(" ");
}

function parseSetupInput(input: unknown): SetupInput {
  if (!input || typeof input !== "object") {
    return { location: "global" };
  }

  const location = (input as Record<string, unknown>).location;
  return {
    location: location === "project" ? "project" : "global",
  };
}

function wordpressConfigPath(
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

function appendWordPressTemplate(existing: string, location: "global" | "project"): string {
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

  return existing.trim() ? `${existing.replace(/\s*$/, "\n\n")}${template}` : template;
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

async function publishToWordPress(input: {
  url: string;
  username: string;
  appPassword: string;
  title: string;
  html: string;
  status: "draft" | "publish";
}): Promise<string> {
  const baseUrl = input.url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/wp-json/wp/v2/posts`;
  const credentials = btoa(`${input.username}:${input.appPassword}`);

  const response = await fetch(endpoint, {
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

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`WordPress API error ${response.status}: ${JSON.stringify(json)}`);
  }

  return typeof json.link === "string" ? json.link : "(no link returned)";
}

function configString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
