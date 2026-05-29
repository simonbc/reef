import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { defineSkill, defineTool } from "../../src/skill-api";

type GitRunner = (args: string[], cwd: string) => Promise<string>;
type SetupInput = { location: "global" | "project" };

export default defineSkill({
  name: "github-pages",
  systemPrompt:
    [
      "GitHub Pages publishing requires a built dist/ directory.",
      "Use github-pages_publish_site only when the user explicitly asks to publish, deploy, or push to GitHub Pages.",
      "If the site has changed and dist/ may be stale, build the site before publishing.",
      "GitHub Pages configuration uses [github-pages].repo and optional [github-pages].branch.",
      "Use github-pages_setup_config when the user asks to set up GitHub Pages or agrees to create the template.",
    ].join(" "),
  tools: [
    defineTool({
      name: "setup_config",
      description:
        "Create a fill-in GitHub Pages config template. Defaults to ~/.reef/config.toml so it can be reused across Reef projects.",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            enum: ["global", "project"],
            description:
              "Where to write the template. Use global for ~/.reef/config.toml; use project for ./reef.toml.",
          },
        },
      },
      run: async (input, ctx) => {
        const parsed = parseSetupInput(input);
        const target = githubPagesConfigPath(ctx, parsed.location);
        const existing = await readOptionalFile(target);
        if (/\[github-pages\]/.test(existing)) {
          return `GitHub Pages config already exists in ${target}. Fill in the values there.`;
        }

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, appendGithubPagesTemplate(existing));
        return [
          `Created GitHub Pages config template in ${target}.`,
          "Fill in [github-pages].repo and branch, then try publishing again.",
        ].join(" ");
      },
    }),
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

function parseSetupInput(input: unknown): SetupInput {
  if (!input || typeof input !== "object") {
    return { location: "global" };
  }

  const location = (input as Record<string, unknown>).location;
  return {
    location: location === "project" ? "project" : "global",
  };
}

function githubPagesConfigPath(
  ctx: { config: Record<string, unknown>; workspace: { root: string } },
  location: "global" | "project",
): string {
  if (location === "project") {
    return join(ctx.workspace.root, "reef.toml");
  }

  return configString(ctx.config.__global_config_path) ?? join(homedir(), ".reef", "config.toml");
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function appendGithubPagesTemplate(existing: string): string {
  const template = [
    "[github-pages]",
    'repo = "git@github.com:you/you.github.io.git"',
    'branch = "gh-pages"',
    "",
  ].join("\n");

  return existing.trim() ? `${existing.replace(/\s*$/, "\n\n")}${template}` : template;
}

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
