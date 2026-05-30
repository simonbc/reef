import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import { createWorkspace } from "./workspace";

export type HarnessApp = {
  fetch(request: Request): Promise<Response>;
};

export function createHarnessApp(input: { root: string }): HarnessApp {
  const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  return {
    fetch: (request) => handleRequest(input.root, request, reloadClients),
  };
}

async function handleRequest(
  root: string,
  request: Request,
  reloadClients: Set<ReadableStreamDefaultController<Uint8Array>>,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/__reef/events") {
    return reloadEventStream(reloadClients);
  }

  if (url.pathname === "/__reef/build" && request.method === "POST") {
    const config = await loadConfig(root);
    const workspace = await createWorkspace(root);
    const result = await buildSite({
      title: config.title,
      domain: config.domain,
      workspace,
    });
    notifyReload(reloadClients);
    return jsonResponse({ ok: true, files: result.files });
  }

  if (url.pathname === "/") {
    return staticFile(root, "index.html");
  }

  return staticFile(root, decodeURIComponent(url.pathname.replace(/^\/+/, "")));
}

async function staticFile(root: string, relativePath: string): Promise<Response> {
  const distRoot = resolve(root, "dist");
  const normalizedPath =
    relativePath === "" || relativePath.endsWith("/")
      ? join(relativePath, "index.html")
      : relativePath;
  const fullPath = resolve(distRoot, normalizedPath);
  if (!isInsideDirectory(distRoot, fullPath)) {
    return htmlResponse(unbuiltSite(), 404);
  }

  try {
    const body = await readFile(fullPath);
    if (contentType(fullPath).startsWith("text/html")) {
      return htmlResponse(injectReloadScript(new TextDecoder().decode(body)));
    }

    return new Response(body, {
      headers: {
        "content-type": contentType(fullPath),
      },
    });
  } catch {
    return htmlResponse(unbuiltSite(), 404);
  }
}

function reloadEventStream(
  clients: Set<ReadableStreamDefaultController<Uint8Array>>,
): Response {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      if (controllerRef) {
        clients.delete(controllerRef);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function notifyReload(clients: Set<ReadableStreamDefaultController<Uint8Array>>): void {
  const encoder = new TextEncoder();
  const payload = encoder.encode("event: reload\ndata: built\n\n");

  for (const client of [...clients]) {
    try {
      client.enqueue(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function injectReloadScript(html: string): string {
  if (html.includes("/__reef/events")) {
    return html;
  }

  const script = [
    "<script>",
    "(() => {",
    "  const events = new EventSource('/__reef/events');",
    "  events.addEventListener('reload', () => location.reload());",
    "})();",
    "</script>",
  ].join("");

  return html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
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

function isInsideDirectory(parent: string, child: string): boolean {
  const childRelativePath = relative(parent, child);
  return (
    childRelativePath === "" ||
    (!childRelativePath.startsWith("..") && !childRelativePath.startsWith(sep))
  );
}
