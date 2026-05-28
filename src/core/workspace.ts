import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { PageMeta, PostMeta, WorkspaceAPI } from "../skill-api";
import { parseMarkdown } from "./markdown";

export async function createWorkspace(root: string): Promise<WorkspaceAPI> {
  const absoluteRoot = resolve(root);

  return {
    root: absoluteRoot,
    listPosts: () => listMarkdown(absoluteRoot, "posts"),
    readPost: (slugOrPath) => readMarkdown(absoluteRoot, "posts", slugOrPath),
    writePost: (slug, markdown) => writeMarkdown(absoluteRoot, "posts", slug, markdown),
    createPost: (slug, date, body, title) =>
      writeMarkdown(
        absoluteRoot,
        "posts",
        slug,
        `---\ntitle: ${title ?? slug}\ndate: ${date}\n---\n\n${body}\n`,
      ),
    deletePost: (slug) => deleteMarkdown(absoluteRoot, "posts", slug),
    listPages: () => listMarkdown(absoluteRoot, "pages"),
    readPage: (slugOrPath) => readMarkdown(absoluteRoot, "pages", slugOrPath),
    writePage: (slug, markdown) => writeMarkdown(absoluteRoot, "pages", slug, markdown),
    createPage: (slug) => writeMarkdown(absoluteRoot, "pages", slug, `# ${slug}\n`),
    deletePage: (slug) => deleteMarkdown(absoluteRoot, "pages", slug),
    listMedia: () => listFiles(join(absoluteRoot, "media")),
    readMedia: async (filename) => {
      try {
        return new Uint8Array(await readFile(join(absoluteRoot, "media", filename)));
      } catch {
        return null;
      }
    },
    writeMedia: async (filename, bytes) => {
      const fullPath = join(absoluteRoot, "media", filename);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, bytes);
    },
    deleteMedia: (filename) => rm(join(absoluteRoot, "media", filename), { force: true }),
    search: async (query) => {
      const needle = query.toLowerCase();
      const posts = await listMarkdown(absoluteRoot, "posts");
      const pages = await listMarkdown(absoluteRoot, "pages");
      const results: { kind: "post" | "page"; slug: string }[] = [];

      for (const post of posts) {
        const body = (await readMarkdown(absoluteRoot, "posts", post.slug)) ?? "";
        if (body.toLowerCase().includes(needle)) {
          results.push({ kind: "post", slug: post.slug });
        }
      }

      for (const page of pages) {
        const body = (await readMarkdown(absoluteRoot, "pages", page.slug)) ?? "";
        if (body.toLowerCase().includes(needle)) {
          results.push({ kind: "page", slug: page.slug });
        }
      }

      return results;
    },
    backlinks: async () => [],
    skillState: {
      read: async (skillName, key) => {
        try {
          const raw = await readFile(skillStatePath(absoluteRoot, skillName, key), "utf8");
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      write: async (skillName, key, value) => {
        const fullPath = skillStatePath(absoluteRoot, skillName, key);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, JSON.stringify(value, null, 2));
      },
    },
  };
}

async function listMarkdown(root: string, kind: "posts"): Promise<PostMeta[]>;
async function listMarkdown(root: string, kind: "pages"): Promise<PageMeta[]>;
async function listMarkdown(root: string, kind: "posts" | "pages"): Promise<(PostMeta | PageMeta)[]> {
  const dir = join(root, kind);
  const files = await listFiles(dir);
  const markdownFiles = files.filter((file) => file.endsWith(".md"));
  const items: (PostMeta | PageMeta)[] = [];

  for (const file of markdownFiles) {
    const fullPath = join(dir, file);
    const source = await readFile(fullPath, "utf8");
    const slug = file.replace(/\.md$/, "");
    const parsed = parseMarkdown(source, slug);
    items.push({
      slug,
      path: relative(root, fullPath),
      title: parsed.title,
      ...(kind === "posts" ? { date: parsed.frontmatter.date } : {}),
    });
  }

  return kind === "posts"
    ? items.sort((a, b) => String((b as PostMeta).date ?? "").localeCompare(String((a as PostMeta).date ?? "")))
    : items.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readMarkdown(
  root: string,
  kind: "posts" | "pages",
  slugOrPath: string,
): Promise<string | null> {
  for (const candidate of markdownCandidates(root, kind, slugOrPath)) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try next common path shape.
    }
  }

  return null;
}

async function writeMarkdown(
  root: string,
  kind: "posts" | "pages",
  slug: string,
  markdown: string,
): Promise<void> {
  const normalized = slug.endsWith(".md") ? slug : `${slug}.md`;
  const fullPath = join(root, kind, normalized);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, markdown);
}

async function deleteMarkdown(root: string, kind: "posts" | "pages", slug: string): Promise<void> {
  const normalized = slug.endsWith(".md") ? slug : `${slug}.md`;
  await rm(join(root, kind, normalized), { force: true });
}

function markdownCandidates(root: string, kind: "posts" | "pages", slugOrPath: string): string[] {
  const candidates = [slugOrPath];
  const withoutSpike = slugOrPath.startsWith("spike/")
    ? slugOrPath.slice("spike/".length)
    : slugOrPath;

  candidates.push(withoutSpike);
  candidates.push(join(kind, withoutSpike));

  if (!withoutSpike.endsWith(".md")) {
    candidates.push(`${withoutSpike}.md`);
    candidates.push(join(kind, `${withoutSpike}.md`));
  }

  return [...new Set(candidates)].map((candidate) => resolve(root, candidate));
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
  } catch {
    return [];
  }
}

function skillStatePath(root: string, skillName: string, key: string): string {
  const safeKey = key.replace(/[^A-Za-z0-9_.:-]/g, "_");
  return join(root, ".reef", "skill-state", skillName, `${safeKey}.json`);
}
