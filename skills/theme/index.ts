import { defineSkill, defineTool } from "../../src/skill-api";
import { buildSite } from "../../src/core/build";
import { loadConfig } from "../../src/core/config";
import { readTheme, writeThemeFile } from "../../src/core/theme";

export default defineSkill({
  name: "theme",
  systemPrompt:
    "Theme files are canonical design source in theme/layout.html and theme/styles.css. Theme update tools rebuild dist/ automatically after writing canonical theme files.",
  tools: [
    defineTool({
      name: "read",
      description:
        "Read the current canonical theme files. Returns default theme contents if files do not exist yet.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const theme = await readTheme(ctx.workspace.root);
        return [
          "theme/layout.html",
          "```html",
          theme.layout,
          "```",
          "",
          "theme/styles.css",
          "```css",
          theme.css,
          "```",
        ].join("\n");
      },
    }),
    defineTool({
      name: "update_css",
      description:
        "Replace canonical theme CSS in theme/styles.css. Use for visual design changes.",
      inputSchema: {
        type: "object",
        properties: {
          css: {
            type: "string",
            description: "Complete CSS contents for theme/styles.css.",
          },
        },
        required: ["css"],
      },
      run: async (input, ctx) => {
        await writeThemeFile(ctx.workspace.root, "styles.css", stringInput(input, "css"));
        await rebuild(ctx.workspace.root, ctx.workspace);
        return "Updated theme/styles.css and rebuilt dist/.";
      },
    }),
    defineTool({
      name: "update_layout",
      description:
        "Replace canonical theme layout in theme/layout.html. Must include {{content}} where rendered page content should appear.",
      inputSchema: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description:
              "Complete HTML layout. Supported placeholders: {{title}}, {{siteTitle}}, {{heading}}, {{content}}.",
          },
        },
        required: ["html"],
      },
      run: async (input, ctx) => {
        const html = stringInput(input, "html");
        if (!html.includes("{{content}}")) {
          throw new Error("theme/layout.html must include {{content}}.");
        }
        await writeThemeFile(ctx.workspace.root, "layout.html", html);
        await rebuild(ctx.workspace.root, ctx.workspace);
        return "Updated theme/layout.html and rebuilt dist/.";
      },
    }),
  ],
});

function stringInput(input: unknown, key: string): string {
  if (!input || typeof input !== "object") {
    throw new Error("Tool input must be an object.");
  }
  const value = (input as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Tool input requires ${key}.`);
  }
  return value;
}

async function rebuild(root: string, workspace: Parameters<typeof buildSite>[0]["workspace"]) {
  const config = await loadConfig(root);
  await buildSite({
    title: config.title,
    domain: config.domain,
    workspace,
  });
}
