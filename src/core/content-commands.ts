import type { PageMeta, PostMeta, WorkspaceAPI } from "../skill-api";

export type ContentKind = "posts" | "pages";

export type ContentReadResult = {
  meta?: PostMeta | PageMeta;
  markdown: string;
  path: string;
};

export async function listContent(
  workspace: Pick<WorkspaceAPI, "listPosts" | "listPages">,
  kind: ContentKind,
): Promise<(PostMeta | PageMeta)[]> {
  return kind === "posts" ? workspace.listPosts() : workspace.listPages();
}

export async function readContent(
  workspace: Pick<WorkspaceAPI, "listPosts" | "readPost" | "listPages" | "readPage">,
  kind: ContentKind,
  ref: string,
): Promise<ContentReadResult> {
  const items = await listContent(workspace, kind);
  const path = resolveContentRef(items, kind, ref);
  const markdown = kind === "posts" ? await workspace.readPost(path) : await workspace.readPage(path);

  if (!markdown) {
    throw new Error(`${label(kind)} not found: ${path}`);
  }

  return {
    meta: items.find((item) => item.path === path || item.slug === path),
    markdown,
    path,
  };
}

export function formatContentList(
  items: (PostMeta | PageMeta)[],
  kind: ContentKind,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify({ [kind]: items }, null, 2);
  }

  if (items.length === 0) {
    return `No ${kind} found.`;
  }

  return items
    .map((item, index) => {
      const date = "date" in item && item.date ? ` ${item.date}` : "";
      return `${index + 1}. ${item.title ?? item.slug}${date} (${item.path})`;
    })
    .join("\n");
}

export function formatContentRead(
  result: ContentReadResult,
  options: { json?: boolean } = {},
): string {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }

  return result.markdown;
}

function resolveContentRef(
  items: (PostMeta | PageMeta)[],
  kind: ContentKind,
  ref: string,
): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error(`${label(kind)} reference is required.`);
  }

  if (/^\d+$/.test(trimmed)) {
    const item = items[Number(trimmed) - 1];
    if (!item) {
      throw new Error(`${label(kind)} number not found: ${trimmed}`);
    }
    return item.path;
  }

  return trimmed;
}

function label(kind: ContentKind): string {
  return kind === "posts" ? "Post" : "Page";
}
