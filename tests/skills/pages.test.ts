import { describe, expect, test } from "bun:test";
import pages from "../../skills/pages";
import type { ToolContext, WorkspaceAPI } from "../../src/skill-api";

describe("pages skill", () => {
  test("lists pages with paths and titles", async () => {
    const result = await tool("list").run({}, context({
      pages: [
        { slug: "about", path: "pages/about.md", title: "About" },
        { slug: "contact", path: "pages/contact.md" },
      ],
      markdown: null,
    }));

    expect(result).toBe("pages/about.md - About\npages/contact.md");
  });

  test("reads numbered page selections from the current page list", async () => {
    const readPaths: string[] = [];
    const result = await tool("read").run(
      { path: "1" },
      context({
        pages: [{ slug: "about", path: "pages/about.md", title: "About" }],
        markdown: "# About",
        readPage: async (path) => {
          readPaths.push(path);
          return "# About";
        },
      }),
    );

    expect(result).toBe("# About");
    expect(readPaths).toEqual(["pages/about.md"]);
  });

  test("creates a markdown page", async () => {
    const written: { slug: string; markdown: string }[] = [];

    const result = await tool("create").run(
      {
        slug: "about",
        title: "About",
        body: "A short bio goes here.",
      },
      context({
        pages: [],
        markdown: null,
        writePage: async (slug, markdown) => {
          written.push({ slug, markdown });
        },
      }),
    );

    expect(result).toBe("Created pages/about.md.");
    expect(written).toEqual([
      {
        slug: "about",
        markdown: "---\ntitle: About\n---\n\nA short bio goes here.\n",
      },
    ]);
  });

  test("reports missing pages", async () => {
    const result = await tool("read").run(
      { path: "missing" },
      context({ pages: [], markdown: null }),
    );

    expect(result).toBe("Page not found: missing");
  });
});

function tool(name: string) {
  const found = pages.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`${name} tool missing`);
  }
  return found;
}

function context(input: {
  pages: Awaited<ReturnType<WorkspaceAPI["listPages"]>>;
  markdown: string | null;
  readPage?: WorkspaceAPI["readPage"];
  writePage?: WorkspaceAPI["writePage"];
}): ToolContext {
  return {
    config: {},
    secrets: {},
    workspace: {
      listPages: async () => input.pages,
      readPage: input.readPage ?? (async () => input.markdown),
      writePage:
        input.writePage ??
        (async () => {
          throw new Error("writePage should not be called");
        }),
    } as Partial<WorkspaceAPI> as WorkspaceAPI,
  };
}
