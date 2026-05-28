import { defineSkill, defineTool } from "../../src/skill-api";

export default defineSkill({
  name: "posts",
  systemPrompt:
    "Posts are chronological markdown files in posts/. Use posts_read before publishing when the user names a local post.",
  tools: [
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
        const path = pathInput(input);
        const markdown = await ctx.workspace.readPost(path);
        if (!markdown) {
          return `Post not found: ${path}`;
        }
        return markdown;
      },
    }),
  ],
});

function pathInput(input: unknown): string {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }
  const path = (input as Record<string, unknown>).path;
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("Tool input requires path.");
  }
  return path;
}
