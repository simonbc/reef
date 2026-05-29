import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import { createWorkspace } from "./workspace";

export type HarnessApp = {
  fetch(request: Request): Promise<Response>;
};

export function createHarnessApp(input: { root: string }): HarnessApp {
  return {
    fetch: (request) => handleRequest(input.root, request),
  };
}

async function handleRequest(root: string, request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/__reef/build" && request.method === "POST") {
    const config = await loadConfig(root);
    const workspace = await createWorkspace(root);
    const result = await buildSite({
      title: config.title,
      domain: config.domain,
      workspace,
    });
    return jsonResponse({ ok: true, files: result.files });
  }

  if (url.pathname === "/") {
    return staticFile(root, "index.html");
  }

  return staticFile(root, decodeURIComponent(url.pathname.replace(/^\/+/, "")));
}

async function staticFile(root: string, relativePath: string): Promise<Response> {
  const normalizedPath =
    relativePath === "" || relativePath.endsWith("/")
      ? join(relativePath, "index.html")
      : relativePath;
  const fullPath = join(root, "dist", normalizedPath);
  try {
    const body = await readFile(fullPath);
    return new Response(body, {
      headers: {
        "content-type": contentType(fullPath),
      },
    });
  } catch {
    return htmlResponse(unbuiltSite(), 404);
  }
}

function unbuiltSite(): string {
  return [
    "<!doctype html>",
    "<html><body>",
    "<h1>Not built yet</h1>",
    "<p>Run <code>reef build</code> or type <code>/build</code> in the Reef terminal harness.</p>",
    "</body></html>",
  ].join("");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function contentType(path: string): string {
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}
