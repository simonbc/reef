import { defineSkill, defineTool } from "../../src/skill-api";

export default defineSkill({
  name: "pages",
  systemPrompt:
    "Pages are stable markdown files in pages/. Use pages_create when the user asks to create a local page such as About, Contact, or Projects. Use pages_read before modifying or publishing an existing page.",
  tools: [
    defineTool({
      name: "create",
      description:
        "Create a markdown page in pages/. Use this before adding page links so markdown remains canonical source.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Page slug, for example about.",
          },
          body: {
            type: "string",
            description: "Markdown body without frontmatter.",
          },
          title: {
            type: "string",
            description: "Optional page title.",
          },
        },
        required: ["slug", "body"],
      },
      run: async (input, ctx) => {
        const parsed = createInput(input);
        await ctx.workspace.writePage(parsed.slug, pageMarkdown(parsed));
        return `Created pages/${parsed.slug}.md.`;
      },
    }),
    defineTool({
      name: "list",
      description: "List local markdown pages in the workspace.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const pages = await ctx.workspace.listPages();
        if (pages.length === 0) {
          return "No pages found.";
        }
        return pages
          .map((page) => `${page.path}${page.title ? ` - ${page.title}` : ""}`)
          .join("\n");
      },
    }),
    defineTool({
      name: "read",
      description:
        "Read a local markdown page by slug, path, or current list number.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Page slug, path, or number, for example about, pages/about.md, or 1.",
          },
        },
        required: ["path"],
      },
      run: async (input, ctx) => {
        const path = await resolvePagePath(pathInput(input), ctx);
        const markdown = await ctx.workspace.readPage(path);
        if (!markdown) {
          return `Page not found: ${path}`;
        }
        return markdown;
      },
    }),
  ],
});

function createInput(input: unknown): {
  slug: string;
  body: string;
  title?: string;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }

  const record = input as Record<string, unknown>;
  const slug = requiredString(record.slug, "slug");
  const body = requiredString(record.body, "body");
  const title = optionalString(record.title);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error("Page slug must use lowercase letters, numbers, and hyphens.");
  }

  return { slug, body, title };
}

function pageMarkdown(input: { slug: string; body: string; title?: string }): string {
  return [
    "---",
    `title: ${input.title ?? titleFromSlug(input.slug)}`,
    "---",
    "",
    input.body,
    "",
  ].join("\n");
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

async function resolvePagePath(
  path: string,
  ctx: { workspace: { listPages(): Promise<{ path: string }[]> } },
): Promise<string> {
  if (!/^\d+$/.test(path)) {
    return path;
  }

  const index = Number(path) - 1;
  const pages = await ctx.workspace.listPages();
  return pages[index]?.path ?? path;
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
