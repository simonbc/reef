import { stat } from "node:fs/promises";
import { parseMarkdown } from "./markdown";
import { resolveContentReadCandidates, type ContentKind } from "./workspace-paths";

type CachedDocument = {
  mtimeMs: number;
  source: string;
  title: string;
  html: string;
};

export type MarkdownPreviewCache = Map<string, CachedDocument>;

export async function cachedMarkdown(
  cache: MarkdownPreviewCache,
  root: string,
  kind: ContentKind,
  fallbackTitle: string,
  source: string,
): Promise<{ title: string; html: string }> {
  const fullPath = resolveContentReadCandidates(root, kind, fallbackTitle)[0];
  const mtimeMs = fullPath ? await markdownMtime(fullPath) : 0;
  const cacheKey = fullPath ?? `${kind}:${fallbackTitle}`;
  const cached = cache.get(cacheKey);
  if (cached?.mtimeMs === mtimeMs && cached.source === source) {
    return { title: cached.title, html: cached.html };
  }

  const parsed = parseMarkdown(source, fallbackTitle);
  const next = {
    mtimeMs,
    source,
    title: parsed.title ?? fallbackTitle,
    html: parsed.html,
  };
  cache.set(cacheKey, next);
  return { title: next.title, html: next.html };
}

async function markdownMtime(fullPath: string): Promise<number> {
  try {
    return (await stat(fullPath)).mtimeMs;
  } catch {
    return 0;
  }
}
