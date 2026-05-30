import { loadConfig } from "./config";
import { createLivePreview } from "./live-preview";

export type HarnessApp = {
  fetch(request: Request): Promise<Response>;
};

export function createHarnessApp(input: { root: string }): HarnessApp {
  const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let preview: ReturnType<typeof createLivePreview> | null = null;
  return {
    fetch: async (request) => {
      if (!preview) {
        const config = await loadConfig(input.root);
        preview = createLivePreview({ root: input.root, title: config.title });
      }
      return handleRequest(preview, request, reloadClients);
    },
  };
}

async function handleRequest(
  preview: ReturnType<typeof createLivePreview>,
  request: Request,
  reloadClients: Set<ReadableStreamDefaultController<Uint8Array>>,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/__reef/events") {
    return reloadEventStream(reloadClients);
  }

  const response = await preview.render(url.pathname);
  if (response.headers.get("content-type")?.startsWith("text/html")) {
    return htmlResponse(injectReloadScript(await response.text()), response.status);
  }
  return response;
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

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
