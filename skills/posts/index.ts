import { defineSkill, defineTool } from "../../src/skill-api";

export default defineSkill({
  name: "posts",
  systemPrompt:
    "Posts are chronological markdown files in posts/. Use posts_create when the user asks to create a local post or when new content should become canonical markdown before publishing. Use posts_read before publishing when the user names an existing local post.",
  tools: [
    defineTool({
      name: "create",
      description:
        "Create a dated markdown post in posts/. Use this before publishing new content so markdown remains canonical source.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Post slug, for example hello-from-reef.",
          },
          date: {
            type: "string",
            description: "ISO date, for example 2026-05-29.",
          },
          body: {
            type: "string",
            description: "Markdown body without frontmatter.",
          },
          title: {
            type: "string",
            description: "Optional post title.",
          },
        },
        required: ["slug", "date", "body"],
      },
      run: async (input, ctx) => {
        const parsed = createInput(input);
        await ctx.workspace.createPost(parsed.slug, parsed.date, parsed.body, parsed.title);
        return `Created posts/${parsed.slug}.md.`;
      },
    }),
    defineTool({
      name: "list",
      description: "List local markdown posts in the workspace.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const posts = await ctx.workspace.listPosts();
        if (posts.length === 0) {
          return "No posts found.";
        }
        return posts
          .map((post) => `${post.path}${post.title ? ` - ${post.title}` : ""}`)
          .join("\n");
      },
    }),
    defineTool({
      name: "read",
      description:
        "Read a local markdown post by slug or path. Use this before publishing a post if the publisher needs the markdown content.",
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
        const path = await resolvePostPath(pathInput(input), ctx);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }
        return markdown;
      },
    }),
  ],
});

function createInput(input: unknown): {
  slug: string;
  date: string;
  body: string;
  title?: string;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  const slug = requiredString(record.slug, "slug");
  const date = requiredString(record.date, "date");
  const body = requiredString(record.body, "body");
  const title = optionalString(record.title);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error("Post slug must use lowercase letters, numbers, and hyphens.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Post date must use YYYY-MM-DD.");
  }

  return { slug, date, body, title };
}

function pathInput(input: unknown): string {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }
  const path = (input as Record<string, unknown>).path;
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("Tool input requires path.");
  }
  return path.trim();
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

function requiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Tool input requires ${key}.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
