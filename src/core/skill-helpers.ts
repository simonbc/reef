import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type SetupLocation = "global" | "project";

export type PublishedState = {
  id: string;
  url: string;
};

export function configString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function parseSetupInput(input: unknown): { location: SetupLocation } {
  if (!input || typeof input !== "object") {
    return { location: "global" };
  }

  const location = (input as Record<string, unknown>).location;
  return {
    location: location === "project" ? "project" : "global",
  };
}

export function skillConfigPath(
  ctx: { config: Record<string, unknown>; workspace: { root: string } },
  location: SetupLocation,
): string {
  if (location === "project") {
    return join(ctx.workspace.root, "reef.toml");
  }

  return configString(ctx.config.__global_config_path) ?? join(homedir(), ".reef", "config.toml");
}

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

export function appendConfigTemplate(existing: string, template: string): string {
  return existing.trim() ? `${existing.replace(/\s*$/, "\n\n")}${template}` : template;
}

export async function resolvePostPath(
  path: string,
  ctx: { workspace: { listPosts(): Promise<{ path: string }[]> } },
): Promise<string> {
  if (!/^\d+$/.test(path)) {
    return path;
  }

  const index = Number(path) - 1;
  const posts = await ctx.workspace.listPosts();
  return posts[index]?.path ?? path;
}

export function postStateKey(path: string): string {
  return `post:${path.replace(/^posts\//, "").replace(/\.md$/, "")}`;
}

export function isPublishedState(value: unknown): value is PublishedState {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).url === "string"
  );
}

export async function fetchJson(
  label: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, init);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${label} API error ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}
