import type { PageMeta, PostMeta } from "../skill-api";
import { PREVIEW_CSS } from "./preview-styles";

export function renderShellHtml(input: {
  title: string;
  posts: PostMeta[];
  pages: PageMeta[];
}): string {
  const postsList = input.posts
    .map(
      (post) =>
        `<li><a href="/posts/${encodePath(post.slug)}/">${escapeHtml(post.title ?? post.slug)}</a>${post.date ? ` <span>${escapeHtml(post.date)}</span>` : ""}</li>`,
    )
    .join("");
  const pagesList = input.pages
    .map((page) => `<li><a href="/pages/${encodePath(page.slug)}/">${escapeHtml(page.title ?? page.slug)}</a></li>`)
    .join("");

  return appLayout(
    input.title,
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

export function renderDocumentHtml(input: {
  siteTitle: string;
  title: string;
  html: string;
}): string {
  return appLayout(
    input.siteTitle,
    input.title,
    `<article><h1>${escapeHtml(input.title)}</h1>${input.html}</article>`,
  );
}

export function renderNotFoundHtml(siteTitle: string, message: string): string {
  return appLayout(siteTitle, "Not found", `<p>${escapeHtml(message)}</p>`);
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
    PREVIEW_CSS,
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
