import { defineSkill, defineTool } from "../../src/skill-api";
import { resolveViewTarget, type OpenRunner } from "../../src/core/open";

export default defineSkill({
  name: "open",
  systemPrompt:
    "Use open_view_latest_post when the user asks to view, open, or look at their latest post in the browser. Use open_view_post or open_view_page for named local posts/pages in the Reef workspace app. Use open_server for the local app.",
  tools: [
    defineTool({
      name: "server",
      description: "Open the local Reef workspace app in the browser.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const target = { type: "server" as const, url: localServerUrl(ctx.config) };
        await openRunner(ctx.config)(target);
        return `Opened ${target.url}`;
      },
    }),
    defineTool({
      name: "view_latest_post",
      description: "Open the latest local post in the browser.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const posts = await ctx.workspace.listPosts();
        const latest = posts[0];
        if (!latest) {
          return "No posts found.";
        }

        const target = await resolveViewTarget({
          kind: "post",
          slug: latest.slug,
          port: portNumber(ctx.config),
        });
        await openRunner(ctx.config)(target);
        return `Opened latest post: ${target.url}`;
      },
    }),
    defineTool({
      name: "view_post",
      description: "Open a named local post in the browser.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Post slug, for example hello.",
          },
        },
        required: ["slug"],
      },
      run: async (input, ctx) => {
        const slug = slugInput(input);
        const target = await resolveViewTarget({
          kind: "post",
          slug,
          port: portNumber(ctx.config),
        });
        await openRunner(ctx.config)(target);
        return `Opened post ${slug}: ${target.url}`;
      },
    }),
    defineTool({
      name: "view_page",
      description: "Open a named local page in the browser.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Page slug, for example about.",
          },
        },
        required: ["slug"],
      },
      run: async (input, ctx) => {
        const slug = slugInput(input);
        const target = await resolveViewTarget({
          kind: "page",
          slug,
          port: portNumber(ctx.config),
        });
        await openRunner(ctx.config)(target);
        return `Opened page ${slug}: ${target.url}`;
      },
    }),
  ],
});

function localServerUrl(config: Record<string, unknown>): string {
  return `http://localhost:${portNumber(config)}`;
}

function portNumber(config: Record<string, unknown>): number {
  const value = config.port;
  return typeof value === "number" && Number.isFinite(value) ? value : 3000;
}

function openRunner(config: Record<string, unknown>): OpenRunner {
  const runner = config.__open_runner;
  if (typeof runner !== "function") {
    throw new Error("Open runner is not configured.");
  }
  return runner as OpenRunner;
}

function slugInput(input: unknown): string {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }
  const slug = (input as Record<string, unknown>).slug;
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error("Tool input requires slug.");
  }
  return slug.trim();
}
