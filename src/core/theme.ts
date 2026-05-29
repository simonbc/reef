import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Theme = {
  layout: string;
  css: string;
};

export const DEFAULT_LAYOUT = [
  "<!doctype html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>{{title}}</title>",
  '<link rel="stylesheet" href="/styles.css">',
  "</head>",
  "<body>",
  "<main>",
  "<h1>{{heading}}</h1>",
  "{{content}}",
  "</main>",
  "</body>",
  "</html>",
  "",
].join("\n");

export const DEFAULT_CSS = [
  ":root { color-scheme: light dark; font-family: ui-serif, Georgia, serif; }",
  "body { margin: 0; line-height: 1.55; }",
  "main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }",
  "a { color: currentColor; text-decoration-thickness: 1px; text-underline-offset: 3px; }",
  ".feed { padding-left: 1.2rem; }",
  ".feed li { margin: 0.5rem 0; }",
  "time { color: #666; font-size: 0.9rem; }",
  "",
].join("\n");

export async function readTheme(root: string): Promise<Theme> {
  return {
    layout: await readThemeFile(root, "layout.html", DEFAULT_LAYOUT),
    css: await readThemeFile(root, "styles.css", DEFAULT_CSS),
  };
}

export async function writeThemeFile(
  root: string,
  filename: "layout.html" | "styles.css",
  contents: string,
): Promise<void> {
  const fullPath = join(root, "theme", filename);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

export function renderLayout(input: {
  layout: string;
  title: string;
  siteTitle: string;
  heading: string;
  content: string;
}): string {
  return input.layout
    .replaceAll("{{title}}", escapeHtml(input.title))
    .replaceAll("{{siteTitle}}", escapeHtml(input.siteTitle))
    .replaceAll("{{heading}}", escapeHtml(input.heading))
    .replaceAll("{{content}}", input.content);
}

async function readThemeFile(
  root: string,
  filename: "layout.html" | "styles.css",
  fallback: string,
): Promise<string> {
  try {
    return await readFile(join(root, "theme", filename), "utf8");
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
