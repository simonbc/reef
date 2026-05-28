import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./config";

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
