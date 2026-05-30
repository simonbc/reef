import { describe, expect, test } from "bun:test";
import { renderTerminalMarkdown } from "../../src/core/terminal-markdown";

describe("renderTerminalMarkdown", () => {
  test("renders headings, emphasis, bullets, links, and inline code for terminals", () => {
    const rendered = renderTerminalMarkdown(
      [
        "# Done",
        "",
        "Updated **posts/hello.md** and `reef publish wordpress hello`.",
        "",
        "- [Preview](https://example.com)",
        "- *Publish* next",
      ].join("\n"),
      { colors: false },
    );

    expect(rendered).toBe(
      [
        "Done",
        "",
        "Updated posts/hello.md and reef publish wordpress hello.",
        "",
        "• Preview (https://example.com)",
        "• Publish next",
      ].join("\n"),
    );
  });

  test("renders fenced code blocks without markdown fences", () => {
    const rendered = renderTerminalMarkdown(
      ["Here:", "", "```sh", "reef posts --json", "```"].join("\n"),
      { colors: false },
    );

    expect(rendered).toBe(["Here:", "", "  reef posts --json"].join("\n"));
  });
});
