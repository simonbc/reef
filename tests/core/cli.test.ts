import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("reef CLI", () => {
  test("reports removed build command without invoking the agent prompt", () => {
    const result = Bun.spawnSync(["bun", "run", "bin/reef.ts", "build"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "",
      },
    });

    const stderr = new TextDecoder().decode(result.stderr);
    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("`reef build` was removed. Run `reef` to inspect the live workspace app.");
    expect(stderr).not.toContain("Thinking");
    expect(stderr).not.toContain("Unable to connect");
  });

  test("lists posts as json from a workspace", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "posts", "hello.md"),
      "---\ntitle: Hello\ndate: 2026-05-29\n---\n\n# Hello\n",
    );

    const result = runCli(["posts", "--json"], root);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      posts: [
        {
          slug: "hello",
          path: "posts/hello.md",
          title: "Hello",
          date: "2026-05-29",
        },
      ],
    });
  });

  test("reads numbered content and shows config", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "reef.toml"), 'title = "CLI Reef"\n');
    await writeFile(join(root, "pages", "about.md"), "# About\n\nLocal page.");

    const read = runCli(["page", "read", "1", "--json"], root);
    const config = runCli(["config", "show", "--json"], root);

    expect(read.exitCode).toBe(0);
    expect(JSON.parse(read.stdout)).toMatchObject({
      path: "pages/about.md",
      markdown: "# About\n\nLocal page.",
    });
    expect(config.exitCode).toBe(0);
    expect(JSON.parse(config.stdout)).toEqual({
      path: join(await realpath(root), "reef.toml"),
      source: 'title = "CLI Reef"\n',
    });
  });
});

function runCli(args: string[], cwd: string): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(["bun", "run", resolve("bin/reef.ts"), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: "",
    },
  });

  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-cli-"));
  roots.push(root);
  await Bun.write(join(root, "posts", ".keep"), "");
  await Bun.write(join(root, "pages", ".keep"), "");
  return root;
}
