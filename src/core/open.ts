import { access } from "node:fs/promises";
import { resolveContentReadCandidates } from "./workspace-paths";

export type OpenKind = "post" | "page";
export type OpenTarget =
  | { type: "server"; url: string }
  | { type: "file"; path: string }
  | { type: "url"; url: string };
export type OpenRunner = (target: OpenTarget) => Promise<void> | void;

export async function resolveOpenTarget(input: {
  root: string;
  args: string[];
  port?: number;
  posts?: { path: string }[];
  pages?: { path: string }[];
}): Promise<OpenTarget> {
  const [kind, rawTarget] = input.args;

  if (!kind) {
    return { type: "server", url: `http://localhost:${input.port ?? 3000}` };
  }

  if (kind !== "post" && kind !== "page") {
    throw new Error("Usage: reef open [post <slug-or-path>|page <slug-or-path>]");
  }

  if (!rawTarget) {
    throw new Error(`Usage: reef open ${kind} <slug-or-path>`);
  }

  const target = resolveNumberedTarget(kind, rawTarget, input);
  return { type: "file", path: await resolveMarkdownPath(input.root, kind, target) };
}

export async function resolveViewTarget(input: {
  kind: OpenKind;
  slug: string;
  port?: number;
}): Promise<OpenTarget> {
  const baseUrl = `http://localhost:${input.port ?? 3000}`;
  const prefix = input.kind === "post" ? "posts" : "pages";
  return { type: "url", url: `${baseUrl}/${prefix}/${input.slug}/` };
}

export function openTarget(target: OpenTarget): void {
  const value = target.type === "file" ? target.path : target.url;
  const result = Bun.spawnSync(["open", value], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    const stdout = new TextDecoder().decode(result.stdout).trim();
    throw new Error(`open failed: ${stderr || stdout}`);
  }
}

async function resolveMarkdownPath(
  root: string,
  kind: OpenKind,
  slugOrPath: string,
): Promise<string> {
  const directory = kind === "post" ? "posts" : "pages";
  for (const candidate of resolveContentReadCandidates(root, directory, slugOrPath)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next common path shape.
    }
  }

  throw new Error(`${kind === "post" ? "Post" : "Page"} not found: ${slugOrPath}`);
}

function resolveNumberedTarget(
  kind: OpenKind,
  target: string,
  input: {
    posts?: { path: string }[];
    pages?: { path: string }[];
  },
): string {
  if (!/^\d+$/.test(target)) {
    return target;
  }

  const index = Number(target) - 1;
  const items = kind === "post" ? input.posts : input.pages;
  const item = items?.[index];
  if (!item) {
    throw new Error(`${kind === "post" ? "Post" : "Page"} number not found: ${target}`);
  }
  return item.path;
}
