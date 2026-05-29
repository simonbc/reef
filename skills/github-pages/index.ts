import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineSkill, defineTool } from "../../src/skill-api";

type GitRunner = (args: string[], cwd: string) => Promise<string>;

export default defineSkill({
  name: "github-pages",
  systemPrompt:
    [
      "GitHub Pages publishing requires a built dist/ directory.",
      "Use github-pages_publish_site only when the user explicitly asks to publish, deploy, or push to GitHub Pages.",
      "If the site has changed and dist/ may be stale, build the site before publishing.",
      "GitHub Pages configuration uses [github-pages].repo and optional [github-pages].branch.",
    ].join(" "),
  tools: [
    defineTool({
      name: "publish_site",
      description:
        "Publish the current dist/ directory to a GitHub Pages branch. Requires [github-pages].repo in reef.toml or ~/.reef/config.toml; [github-pages].branch defaults to gh-pages.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      run: async (_input, ctx) => {
        const repo = configString(ctx.config.repo);
        const branch = configString(ctx.config.branch) ?? "gh-pages";
        const injectedRunner = ctx.config.runGit;
        const runGit: GitRunner =
          typeof injectedRunner === "function" ? (injectedRunner as GitRunner) : defaultGitRunner;

        if (!repo) {
          return githubPagesConfigMessage();
        }

        const dist = join(ctx.workspace.root, "dist");
        try {
          await access(dist);
        } catch {
          return "dist/ does not exist. Run `reef build` before publishing to GitHub Pages.";
        }

        const temp = await mkdtemp(join(tmpdir(), "reef-gh-pages-"));
        try {
          await cp(dist, temp, { recursive: true });
          await runGit(["init"], temp);
          await runGit(["checkout", "-B", branch], temp);
          await runGit(["add", "-A"], temp);
          await runGit(["commit", "-m", "Publish Reef site"], temp);
          await runGit(["remote", "add", "origin", repo], temp);
          await runGit(["push", "-f", "origin", branch], temp);
        } finally {
          await rm(temp, { recursive: true, force: true });
        }

        return `Published dist/ to GitHub Pages branch ${branch}.`;
      },
    }),
  ],
});

function githubPagesConfigMessage(): string {
  return [
    "Skill 'github-pages' is not configured.",
    "Set [github-pages].repo in reef.toml or ~/.reef/config.toml.",
    "Set [github-pages].branch if you do not want the default gh-pages branch.",
  ].join(" ");
}

async function defaultGitRunner(args: string[], cwd: string): Promise<string> {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    const stdout = new TextDecoder().decode(result.stdout).trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }

  return new TextDecoder().decode(result.stdout);
}

function configString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
