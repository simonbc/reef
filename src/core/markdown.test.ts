import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  test("uses frontmatter title and renders basic markdown", () => {
    const parsed = parseMarkdown(
      [
        "---",
        "title: Hello from reef",
        "date: 2026-05-28",
        "---",
        "",
        "# Ignored heading",
        "",
        "A **bold** paragraph.",
        "",
        "- one",
        "- two",
      ].join("\n"),
      "fallback",
    );

    expect(parsed.title).toBe("Hello from reef");
    expect(parsed.frontmatter.date).toBe("2026-05-28");
    expect(parsed.html).toContain("<h1>Ignored heading</h1>");
    expect(parsed.html).toContain("<strong>bold</strong>");
    expect(parsed.html).toContain("<ul><li>one</li><li>two</li></ul>");
  });

  test("falls back to first heading when frontmatter has no title", () => {
    const parsed = parseMarkdown("# Heading title\n\nBody", "fallback");

    expect(parsed.title).toBe("Heading title");
  });
});
