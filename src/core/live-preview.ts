import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseMarkdown } from "./markdown";
import { createWorkspace } from "./workspace";

type LivePreview = {
  render(pathname: string): Promise<Response>;
};

type CachedDocument = {
  mtimeMs: number;
  title: string;
  html: string;
};

export function createLivePreview(input: { root: string; title: string }): LivePreview {
  const root = resolve(input.root);
  const cache = new Map<string, CachedDocument>();

  return {
    render: (pathname) => renderPath({ root, title: input.title, cache }, pathname),
  };
}

async function renderPath(
  input: { root: string; title: string; cache: Map<string, CachedDocument> },
  pathname: string,
): Promise<Response> {
  const decodedPath = decodeURIComponent(pathname);

  if (decodedPath === "/" || decodedPath === "") {
    return htmlResponse(await renderShell(input.root, input.title));
  }

  const postSlug = contentSlug(decodedPath, "posts");
  if (postSlug) {
    return renderDocument(input, "posts", postSlug);
  }

  const pageSlug = contentSlug(decodedPath, "pages");
  if (pageSlug) {
    return renderDocument(input, "pages", pageSlug);
  }

  return htmlResponse(appLayout(input.title, "Not found", "<p>Nothing is published at this local app path.</p>"), 404);
}

async function renderShell(root: string, title: string): Promise<string> {
  const workspace = await createWorkspace(root);
  const [posts, pages] = await Promise.all([workspace.listPosts(), workspace.listPages()]);
  const postsList = posts
    .map(
      (post) =>
        `<li><a href="/posts/${encodePath(post.slug)}/">${escapeHtml(post.title ?? post.slug)}</a>${post.date ? ` <span>${escapeHtml(post.date)}</span>` : ""}</li>`,
    )
    .join("");
  const pagesList = pages
    .map((page) => `<li><a href="/pages/${encodePath(page.slug)}/">${escapeHtml(page.title ?? page.slug)}</a></li>`)
    .join("");

  return appLayout(
    title,
    "Workspace",
    [
      '<section class="panel">',
      "<h2>Posts</h2>",
      postsList ? `<ol>${postsList}</ol>` : "<p>No posts yet.</p>",
      "</section>",
      '<section class="panel">',
      "<h2>Pages</h2>",
      pagesList ? `<ol>${pagesList}</ol>` : "<p>No pages yet.</p>",
      "</section>",
    ].join("\n"),
  );
}

async function renderDocument(
  input: { root: string; title: string; cache: Map<string, CachedDocument> },
  kind: "posts" | "pages",
  slug: string,
): Promise<Response> {
  const fullPath = markdownPath(input.root, kind, slug);
  if (!fullPath) {
    return htmlResponse(appLayout(input.title, "Not found", "<p>Markdown source was not found.</p>"), 404);
  }

  try {
    const cached = await cachedMarkdown(input.cache, fullPath, slug);
    return htmlResponse(
      appLayout(
        input.title,
        cached.title,
        `<article><h1>${escapeHtml(cached.title)}</h1>${cached.html}</article>`,
      ),
    );
  } catch (error) {
    if (isNotFound(error)) {
      return htmlResponse(appLayout(input.title, "Not found", "<p>Markdown source was not found.</p>"), 404);
    }
    throw error;
  }
}

async function cachedMarkdown(
  cache: Map<string, CachedDocument>,
  fullPath: string,
  fallbackTitle: string,
): Promise<{ title: string; html: string }> {
  const info = await stat(fullPath);
  const cached = cache.get(fullPath);
  if (cached?.mtimeMs === info.mtimeMs) {
    return { title: cached.title, html: cached.html };
  }

  const parsed = parseMarkdown(await readFile(fullPath, "utf8"), fallbackTitle);
  const next = {
    mtimeMs: info.mtimeMs,
    title: parsed.title ?? fallbackTitle,
    html: parsed.html,
  };
  cache.set(fullPath, next);
  return { title: next.title, html: next.html };
}

function markdownPath(root: string, kind: "posts" | "pages", slug: string): string | null {
  const fullPath = resolve(root, kind, `${slug.replace(/\/+$/, "")}.md`);
  const parent = resolve(root, kind);
  return isInsideDirectory(parent, fullPath) ? fullPath : null;
}

function contentSlug(pathname: string, kind: "posts" | "pages"): string | null {
  const prefix = `/${kind}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const slug = pathname.slice(prefix.length).replace(/\/+$/, "");
  return slug && !slug.endsWith(".md") ? slug : null;
}

function appLayout(siteTitle: string, title: string, content: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)} - ${escapeHtml(siteTitle)}</title>`,
    "<style>",
    "body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f6f7f8; color: #1f2328; }",
    "header { border-bottom: 1px solid #d8dee4; background: #ffffff; }",
    ".bar { max-width: 880px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }",
    "main { max-width: 880px; margin: 0 auto; padding: 24px 20px 48px; }",
    "h1 { margin: 0; font-size: 22px; font-weight: 680; }",
    "h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: 0; color: #57606a; }",
    ".panel { background: #ffffff; border: 1px solid #d8dee4; border-radius: 8px; padding: 18px; margin-bottom: 16px; }",
    "ol { margin: 0; padding-left: 22px; }",
    "li { margin: 8px 0; }",
    "a { color: #0969da; text-decoration: none; }",
    "a:hover { text-decoration: underline; }",
    "article { background: #ffffff; border: 1px solid #d8dee4; border-radius: 8px; padding: 24px; }",
    "article h1 { font-size: 28px; margin-bottom: 16px; }",
    "article p { line-height: 1.55; }",
    ".label { color: #57606a; font-size: 13px; }",
    "</style>",
    "</head>",
    "<body>",
    "<header>",
    `<div class="bar"><h1>${escapeHtml(siteTitle)}</h1><span class="label">Local publishing workspace</span></div>`,
    "</header>",
    "<main>",
    content.startsWith("<article") ? content : `<h1>${escapeHtml(title)}</h1>${content}`,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isInsideDirectory(parent: string, child: string): boolean {
  const childRelativePath = relative(parent, child);
  return (
    childRelativePath === "" ||
    (!childRelativePath.startsWith("..") && !childRelativePath.startsWith(sep))
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
