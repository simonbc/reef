import { defineSkill, defineTool } from "../../src/skill-api";
import { readTheme, writeThemeFile } from "../../src/core/theme";

export default defineSkill({
  name: "theme",
  systemPrompt:
    "Theme files are canonical design source in theme/layout.html and theme/styles.css. Update theme files, then ask the user to run reef build or run build before publishing.",
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
        return "Updated theme/styles.css.";
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
        return "Updated theme/layout.html.";
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
