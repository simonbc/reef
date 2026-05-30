import { join, relative, resolve, sep } from "node:path";

export type ContentKind = "posts" | "pages";

export function contentDirectory(root: string, kind: ContentKind): string {
  return resolve(root, kind);
}

export function mediaDirectory(root: string): string {
  return resolve(root, "media");
}

export function resolveContentReadCandidates(
  root: string,
  kind: ContentKind,
  slugOrPath: string,
): string[] {
  const candidates = [slugOrPath, join(kind, slugOrPath)];

  if (!slugOrPath.endsWith(".md")) {
    candidates.push(`${slugOrPath}.md`);
    candidates.push(join(kind, `${slugOrPath}.md`));
  }

  return [...new Set(candidates)]
    .map((candidate) => resolve(root, candidate))
    .filter((candidate) => isInsideDirectory(contentDirectory(root, kind), candidate));
}

export function resolveContentWritePath(
  root: string,
  kind: ContentKind,
  slugOrPath: string,
): string {
  const normalized = slugOrPath.endsWith(".md") ? slugOrPath : `${slugOrPath}.md`;
  return resolveWorkspacePath(root, kind, normalized);
}

export function resolveMediaPath(root: string, filename: string): string {
  return resolveWorkspacePath(root, "media", filename);
}

export function relativeWorkspacePath(root: string, fullPath: string): string {
  return relative(resolve(root), fullPath);
}

export function isInsideDirectory(parent: string, child: string): boolean {
  const childRelativePath = relative(parent, child);
  return (
    childRelativePath === "" ||
    (!childRelativePath.startsWith("..") && !childRelativePath.startsWith(sep))
  );
}

function resolveWorkspacePath(root: string, directory: string, relativePath: string): string {
  const parent = resolve(root, directory);
  const fullPath = resolve(parent, relativePath);
  if (!isInsideDirectory(parent, fullPath)) {
    throw new Error(`Path must stay inside ${directory}/`);
  }
  return fullPath;
}
