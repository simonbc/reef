import { defineSkill, defineTool } from "../../src/skill-api";
import { parseMarkdown } from "../../src/core/markdown";

type PublishInput = {
  path: string;
  status: "draft" | "publish";
};

export default defineSkill({
  name: "wordpress",
  systemPrompt:
    "WordPress publishing uses the WordPress REST API. Publish only when the user asks to publish or create a draft.",
  tools: [
    defineTool({
      name: "publish_post",
      description:
        "Publish a local markdown post to WordPress. Returns the WordPress post URL.",
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
        const markdown = await ctx.workspace.readPost(parsed.path);
        if (!markdown) {
          return `Post not found: ${parsed.path}`;
        }

        const url = configString(ctx.config.url) ?? process.env.REEF_WP_URL;
        const username =
          ctx.secrets.username ?? process.env.REEF_WORDPRESS_USERNAME;
        const appPassword =
          ctx.secrets.app_password ?? process.env.REEF_WORDPRESS_APP_PASSWORD;

        if (!url || !username || !appPassword) {
          return [
            "Skill 'wordpress' is not configured.",
            "Set REEF_WP_URL, REEF_WORDPRESS_USERNAME, and REEF_WORDPRESS_APP_PASSWORD.",
          ].join(" ");
        }

        const post = parseMarkdown(markdown, parsed.path);
        const link = await publishToWordPress({
          url,
          username,
          appPassword,
          title: post.title ?? parsed.path,
          html: post.html,
          status: parsed.status,
        });

        return `Published ${parsed.path} to WordPress as ${parsed.status}: ${link}`;
      },
    }),
  ],
});

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
    path: record.path,
    status,
  };
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
