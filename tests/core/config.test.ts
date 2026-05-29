import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/core/config";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("loadConfig", () => {
  test("returns feed-first local defaults when reef.toml is absent", async () => {
    const root = await tempRoot("my-blog-");

    await expect(loadConfig(root)).resolves.toEqual({
      root,
      title: root.split("/").at(-1),
      domain: "",
      anthropicKeyEnv: "ANTHROPIC_API_KEY",
      skillConfig: {},
      globalAccounts: {},
    });
  });

  test("merges global user config into project config with project precedence", async () => {
    const root = await tempRoot("reef-project-config-");
    const home = await tempRoot("reef-home-config-");
    await writeFile(
      join(home, "config.toml"),
      [
        'anthropic_key_env = "GLOBAL_ANTHROPIC_KEY"',
        "",
        "[wordpress]",
        'url = "https://global.wordpress.com"',
        "",
        "[github-pages]",
        'repo = "git@github.com:simonbc/global-site.git"',
        'branch = "gh-pages"',
      ].join("\n"),
    );
    await writeFile(
      join(root, "reef.toml"),
      [
        'title = "Project Reef"',
        'domain = "https://project.example"',
        "",
        "[github-pages]",
        'branch = "project-pages"',
      ].join("\n"),
    );

    await expect(loadConfig(root, { globalConfigPath: join(home, "config.toml") })).resolves.toEqual({
      root,
      title: "Project Reef",
      domain: "https://project.example",
      anthropicKeyEnv: "GLOBAL_ANTHROPIC_KEY",
      skillConfig: {
        wordpress: {
          url: "https://global.wordpress.com",
        },
        "github-pages": {
          repo: "git@github.com:simonbc/global-site.git",
          branch: "project-pages",
        },
      },
      globalAccounts: {},
    });
  });

  test("supports nested global account sections as reusable skill config", async () => {
    const root = await tempRoot("reef-global-nested-");
    const home = await tempRoot("reef-home-nested-");
    await writeFile(
      join(home, "config.toml"),
      [
        "[wordpress.personal]",
        'url = "https://personal.wordpress.com"',
        "",
        "[github-pages.personal]",
        'repo = "git@github.com:simonbc/simonbc.github.io.git"',
        'branch = "main"',
      ].join("\n"),
    );

    const config = await loadConfig(root, { globalConfigPath: join(home, "config.toml") });

    expect(config.globalAccounts).toEqual({
      wordpress: {
        personal: {
          url: "https://personal.wordpress.com",
        },
      },
      "github-pages": {
        personal: {
          repo: "git@github.com:simonbc/simonbc.github.io.git",
          branch: "main",
        },
      },
    });
  });

  test("parses top-level config and per-skill sections", async () => {
    const root = await tempRoot("reef-config-");
    await writeFile(
      join(root, "reef.toml"),
      [
        'title = "Simon\'s Blog"',
        'domain = "simonbc.com"',
        'anthropic_key_env = "REEF_ANTHROPIC_KEY"',
        "",
        "[wordpress]",
        'url = "https://example.wordpress.com"',
        "publish_default = true",
      ].join("\n"),
    );

    await expect(loadConfig(root)).resolves.toMatchObject({
      title: "Simon's Blog",
      domain: "simonbc.com",
      anthropicKeyEnv: "REEF_ANTHROPIC_KEY",
      skillConfig: {
        wordpress: {
          url: "https://example.wordpress.com",
          publish_default: true,
        },
      },
    });
  });
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
