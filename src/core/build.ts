import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WorkspaceAPI } from "../skill-api";
import { parseMarkdown } from "./markdown";
import { readTheme, renderLayout } from "./theme";

export type BuildInput = {
  title: string;
  domain: string;
  workspace: WorkspaceAPI;
};

export type BuildResult = {
  files: string[];
};

type RenderedPost = {
  slug: string;
  title: string;
  date?: string;
  html: string;
  urlPath: string;
};

type RenderedPage = {
  slug: string;
  title: string;
  html: string;
  urlPath: string;
};

export async function buildSite(input: BuildInput): Promise<BuildResult> {
  const dist = join(input.workspace.root, "dist");
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const posts = await renderPosts(input.workspace);
  const pages = await renderPages(input.workspace);
  const theme = await readTheme(input.workspace.root);
  const files: string[] = [];

  await writeDistFile(
    input.workspace.root,
    "dist/index.html",
    renderLayout({
      layout: theme.layout,
      title: input.title,
      siteTitle: input.title,
      heading: input.title,
      content: renderHome({ posts, pages }),
    }),
    files,
  );

  for (const post of posts) {
    await writeDistFile(
      input.workspace.root,
      `dist/posts/${post.slug}/index.html`,
      renderLayout({
        layout: theme.layout,
        title: `${post.title} - ${input.title}`,
        siteTitle: input.title,
        heading: post.title,
        content: `<article>${post.html}</article>`,
      }),
      files,
    );
  }

  for (const page of pages) {
    await writeDistFile(
      input.workspace.root,
      `dist/pages/${page.slug}/index.html`,
      renderLayout({
        layout: theme.layout,
        title: `${page.title} - ${input.title}`,
        siteTitle: input.title,
        heading: page.title,
        content: `<article>${page.html}</article>`,
      }),
      files,
    );
  }

  await writeDistFile(input.workspace.root, "dist/feed.json", feedJson(input, posts), files);
  await writeDistFile(input.workspace.root, "dist/styles.css", theme.css, files);

  return { files };
}

async function renderPosts(workspace: WorkspaceAPI): Promise<RenderedPost[]> {
  const posts = await workspace.listPosts();
  const rendered: RenderedPost[] = [];

  for (const post of posts) {
    const source = await workspace.readPost(post.path);
    if (!source) {
      continue;
    }
    const parsed = parseMarkdown(source, post.slug);
    rendered.push({
      slug: post.slug,
      title: parsed.title ?? post.slug,
      date: parsed.frontmatter.date,
      html: parsed.html,
      urlPath: `/posts/${post.slug}/`,
    });
  }

  return rendered;
}

async function renderPages(workspace: WorkspaceAPI): Promise<RenderedPage[]> {
  const pages = await workspace.listPages();
  const rendered: RenderedPage[] = [];

  for (const page of pages) {
    const source = await workspace.readPage(page.path);
    if (!source) {
      continue;
    }
    const parsed = parseMarkdown(source, page.slug);
    rendered.push({
      slug: page.slug,
      title: parsed.title ?? page.slug,
      html: parsed.html,
      urlPath: `/pages/${page.slug}/`,
    });
  }

  return rendered;
}

async function writeDistFile(
  root: string,
  relativePath: string,
  contents: string,
  files: string[],
): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
  files.push(relativePath);
}

function renderHome(input: { posts: RenderedPost[]; pages: RenderedPage[] }): string {
  return [
    "<section>",
    "<h2>Posts</h2>",
    input.posts.length
      ? `<ol class="feed">${input.posts
          .map(
            (post) =>
              `<li><a href="${post.urlPath}">${escapeHtml(post.title)}</a>${post.date ? ` <time>${escapeHtml(post.date)}</time>` : ""}</li>`,
          )
          .join("")}</ol>`
      : "<p>No posts yet.</p>",
    "</section>",
    "<section>",
    "<h2>Pages</h2>",
    input.pages.length
      ? `<nav>${input.pages
          .map((page) => `<a href="${page.urlPath}">${escapeHtml(page.title)}</a>`)
          .join(" ")}</nav>`
      : "<p>No pages yet.</p>",
    "</section>",
  ].join("\n");
}

function feedJson(input: BuildInput, posts: RenderedPost[]): string {
  const baseUrl = input.domain.replace(/\/+$/, "");
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: input.title,
    home_page_url: baseUrl || undefined,
    feed_url: baseUrl ? `${baseUrl}/feed.json` : undefined,
    items: posts.map((post) => ({
      id: post.slug,
      url: baseUrl ? `${baseUrl}${post.urlPath}` : post.urlPath,
      title: post.title,
      date_published: post.date,
      content_html: post.html,
    })),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
