import { resolve } from "node:path";
import { cachedMarkdown, type MarkdownPreviewCache } from "./preview-cache";
import {
  renderDocumentHtml,
  renderNotFoundHtml,
  renderShellHtml,
} from "./preview-renderer";
import { createWorkspace } from "./workspace";

type LivePreview = {
  render(pathname: string): Promise<Response>;
};

export function createLivePreview(input: { root: string; title: string }): LivePreview {
  const root = resolve(input.root);
  const cache: MarkdownPreviewCache = new Map();

  return {
    render: (pathname) => renderPath({ root, title: input.title, cache }, pathname),
  };
}

async function renderPath(
  input: { root: string; title: string; cache: MarkdownPreviewCache },
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

  return htmlResponse(renderNotFoundHtml(input.title, "Nothing is published at this local app path."), 404);
}

async function renderShell(root: string, title: string): Promise<string> {
  const workspace = await createWorkspace(root);
  const [posts, pages] = await Promise.all([workspace.listPosts(), workspace.listPages()]);
  return renderShellHtml({ title, posts, pages });
}

async function renderDocument(
  input: { root: string; title: string; cache: MarkdownPreviewCache },
  kind: "posts" | "pages",
  slug: string,
): Promise<Response> {
  const workspace = await createWorkspace(input.root);
  const source = kind === "posts" ? await workspace.readPost(slug) : await workspace.readPage(slug);

  if (!source) {
    return htmlResponse(renderNotFoundHtml(input.title, "Markdown source was not found."), 404);
  }

  const cached = await cachedMarkdown(input.cache, input.root, kind, slug, source);
  return htmlResponse(renderDocumentHtml({
    siteTitle: input.title,
    title: cached.title,
    html: cached.html,
  }));
}

function contentSlug(pathname: string, kind: "posts" | "pages"): string | null {
  const prefix = `/${kind}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const slug = pathname.slice(prefix.length).replace(/\/+$/, "");
  return slug && !slug.endsWith(".md") ? slug : null;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
