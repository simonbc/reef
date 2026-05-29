import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatConfigSetResult,
  formatProjectConfig,
  readProjectConfig,
  setProjectConfigValue,
} from "../../src/core/config-commands";

describe("config commands", () => {
  test("sets top-level project config values", async () => {
    const root = await tempRoot();

    const result = await setProjectConfigValue(root, "title", "Simon BC");

    expect(await readFile(join(root, "reef.toml"), "utf8")).toBe('title = "Simon BC"\n');
    expect(formatConfigSetResult(result)).toBe(`Set title in ${join(root, "reef.toml")}.`);
    expect(JSON.parse(formatConfigSetResult(result, { json: true }))).toEqual({
      path: join(root, "reef.toml"),
      key: "title",
      value: "Simon BC",
    });
  });

  test("sets section config values", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "reef.toml"), 'title = "Old"\n\n[github-pages]\nbranch = "main"\n');

    await setProjectConfigValue(root, "github-pages.branch", "gh-pages");
    await setProjectConfigValue(root, "github-pages.repo", "git@github.com:simonbc/site.git");

    expect(await readFile(join(root, "reef.toml"), "utf8")).toBe(
      [
        'title = "Old"',
        "",
        "[github-pages]",
        'branch = "gh-pages"',
        'repo = "git@github.com:simonbc/site.git"',
        "",
      ].join("\n"),
    );
  });

  test("adds top-level values before existing sections", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "reef.toml"), '[wordpress]\nurl = "https://example.com"\n');

    await setProjectConfigValue(root, "domain", "https://simonbc.com");

    expect(await readFile(join(root, "reef.toml"), "utf8")).toBe(
      [
        'domain = "https://simonbc.com"',
        "",
        "[wordpress]",
        'url = "https://example.com"',
        "",
      ].join("\n"),
    );
  });

  test("formats project config", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "reef.toml"), 'title = "Simon"\n');

    const source = await readProjectConfig(root);

    expect(formatProjectConfig(join(root, "reef.toml"), source)).toBe('title = "Simon"\n');
    expect(JSON.parse(formatProjectConfig(join(root, "reef.toml"), source, { json: true }))).toEqual({
      path: join(root, "reef.toml"),
      source: 'title = "Simon"\n',
    });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-config-command-"));
  return root;
}
