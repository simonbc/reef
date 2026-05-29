#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { runAgentOnce, type AgentEvent, type ChatTurn } from "../src/core/agent";
import { buildSite } from "../src/core/build";
import { runCliHarness } from "../src/core/cli-harness";
import {
  formatContentList,
  formatContentRead,
  listContent,
  readContent,
  type ContentKind,
} from "../src/core/content-commands";
import { loadConfig } from "../src/core/config";
import { createHarnessApp } from "../src/core/harness";
import { openTarget, resolveOpenTarget } from "../src/core/open";
import { loadSkills } from "../src/core/skill-loader";
import {
  formatSkillCommandResult,
  runSkillCommand,
  type SkillCommandAction,
  type SkillCommandPlatform,
} from "../src/core/skill-commands";
import { createSpinner } from "../src/core/spinner";
import { renderTerminalMarkdown } from "../src/core/terminal-markdown";
import { createWorkspace } from "../src/core/workspace";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command) {
    await runInteractiveHarness();
    process.exit(0);
  }

  if (command === "skill" && args[1] === "list") {
    await listSkills();
    process.exit(0);
  }

  if (command === "build") {
    await build();
    process.exit(0);
  }

  if (command === "posts" || command === "pages") {
    await listContentCommand(command, args.slice(1));
    process.exit(0);
  }

  if ((command === "post" || command === "page") && args[1] === "read") {
    await readContentCommand(command === "post" ? "posts" : "pages", args.slice(2));
    process.exit(0);
  }

  if (command === "publish" || command === "update" || command === "setup") {
    await platformCommand(command, args.slice(1));
    process.exit(0);
  }

  if (command === "open") {
    await openCommand(args.slice(1));
    process.exit(0);
  }

  const prompt = args.join(" ").trim();
  await runPrompt(prompt);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runPrompt(prompt: string): Promise<void> {
  const spinner = createSpinner("Thinking", {
    enabled: process.stderr.isTTY,
  });
  spinner.start();

  let result = "";
  try {
    result = await runPromptText(prompt);
    spinner.stop();
  } catch (error) {
    spinner.stop("Stopped");
    throw error;
  }

  if (result.trim()) {
    console.log(renderTerminalMarkdown(result, { colors: process.stdout.isTTY }));
  }
}

async function runPromptText(
  prompt: string,
  history: ChatTurn[] = [],
  onEvent?: (event: AgentEvent) => void,
  openPort?: number,
) {
  onEvent?.({ type: "phase", message: "Loading config" });
  const config = await loadConfig(process.cwd());
  onEvent?.({ type: "phase", message: "Loading workspace" });
  const workspace = await createWorkspace(process.cwd());
  onEvent?.({ type: "phase", message: "Loading skills" });
  const skills = await loadSkills({
    config,
    workspace,
    openRunner: openTarget,
    openPort,
  });

  return runAgentOnce({
    prompt,
    skills,
    anthropicApiKey: process.env[config.anthropicKeyEnv],
    model: process.env.CLAUDE_MODEL ?? "claude-opus-4-7",
    history,
    onEvent,
  });
}

async function build(): Promise<void> {
  console.log(await buildText());
}

async function buildText(): Promise<string> {
  const config = await loadConfig(process.cwd());
  const workspace = await createWorkspace(process.cwd());
  const result = await buildSite({
    title: config.title,
    domain: config.domain,
    workspace,
  });

  return `Built ${result.files.length} files into dist/.`;
}

async function listSkills(): Promise<void> {
  const config = await loadConfig(process.cwd());
  const workspace = await createWorkspace(process.cwd());
  const skills = await loadSkills({ config, workspace });

  if (skills.length === 0) {
    console.log("No skills loaded.");
    return;
  }

  for (const skill of skills) {
    console.log(`${skill.name}@${skill.version} - ${skill.status}`);
    for (const tool of skill.tools) {
      console.log(`  ${skill.name}_${tool.name}`);
    }
    if (skill.error) {
      console.log(`  error: ${skill.error}`);
    }
  }
}

async function openCommand(args: string[]): Promise<void> {
  const workspace = await createWorkspace(process.cwd());
  const target = await resolveOpenTarget({
    root: process.cwd(),
    args,
    port: Number(process.env.REEF_PORT ?? 3000),
    posts: await workspace.listPosts(),
    pages: await workspace.listPages(),
  });
  openTarget(target);
  console.log(target.type === "server" ? `Opened ${target.url}` : `Opened ${target.path}`);
}

async function platformCommand(action: SkillCommandAction, args: string[]): Promise<void> {
  const json = hasFlag(args, "--json");
  const platform = parsePlatform(args.find((arg) => !arg.startsWith("--")));
  const ref = args.filter((arg) => !arg.startsWith("--"))[1];
  const input = {
    action,
    platform,
    ref,
    status: wordpressStatus(args),
    visibility: mastodonVisibility(args),
    location: setupLocation(args),
  };
  const config = await loadConfig(process.cwd());
  const workspace = await createWorkspace(process.cwd());
  const skills = await loadSkills({ config, workspace });
  const result = await runSkillCommand(skills, input);

  console.log(formatSkillCommandResult(input, result, { json }));
}

async function listContentCommand(kind: ContentKind, args: string[]): Promise<void> {
  const workspace = await createWorkspace(process.cwd());
  console.log(formatContentList(await listContent(workspace, kind), kind, {
    json: hasFlag(args, "--json"),
  }));
}

async function readContentCommand(kind: ContentKind, args: string[]): Promise<void> {
  const json = hasFlag(args, "--json");
  const ref = args.find((arg) => !arg.startsWith("--"));
  if (!ref) {
    throw new Error(`Usage: reef ${kind === "posts" ? "post" : "page"} read <slug|path|number> [--json]`);
  }

  const workspace = await createWorkspace(process.cwd());
  console.log(formatContentRead(await readContent(workspace, kind, ref), { json }));
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parsePlatform(value: string | undefined): SkillCommandPlatform {
  if (value === "wordpress" || value === "mastodon" || value === "github-pages") {
    return value;
  }
  if (value === "github" || value === "pages") {
    return "github-pages";
  }
  throw new Error("Usage: reef publish <wordpress|mastodon|github-pages> [slug|path|number] [--json]");
}

function wordpressStatus(args: string[]): "draft" | "publish" | undefined {
  if (args.includes("--draft")) {
    return "draft";
  }
  if (args.includes("--publish")) {
    return "publish";
  }
  const value = flagValue(args, "--status");
  return value === "draft" || value === "publish" ? value : undefined;
}

function mastodonVisibility(
  args: string[],
): "public" | "unlisted" | "private" | "direct" | undefined {
  const value = flagValue(args, "--visibility");
  return value === "public" || value === "unlisted" || value === "private" || value === "direct"
    ? value
    : undefined;
}

function setupLocation(args: string[]): "global" | "project" | undefined {
  if (args.includes("--project")) {
    return "project";
  }
  if (args.includes("--global")) {
    return "global";
  }
  return undefined;
}

function flagValue(args: string[], flag: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function runInteractiveHarness(): Promise<void> {
  console.log(await buildText());

  const app = createHarnessApp({ root: process.cwd() });
  const port = Number(process.env.REEF_PORT ?? 3000);
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Serving site at http://localhost:${server.port}`);
  console.log("Type a prompt, /build, or /exit.");

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdout.isTTY,
  });

  try {
    const workspace = await createWorkspace(process.cwd());
    await runCliHarness({
      prompts: readline,
      output: process.stdout,
      runPrompt: (prompt, history, onEvent) =>
        runPromptText(prompt, history, onEvent, server.port),
      runBuild: buildText,
      runOpen: async (args) =>
        resolveOpenTarget({
          root: process.cwd(),
          args,
          port: server.port,
          posts: await workspace.listPosts(),
          pages: await workspace.listPages(),
        }),
      listPosts: () => workspace.listPosts(),
      listPages: () => workspace.listPages(),
      openTarget,
      spinnerFactory: (label) =>
        createSpinner(label, {
          enabled: process.stderr.isTTY,
        }),
    });
  } finally {
    readline.close();
    server.stop();
  }
}

function printUsage(): void {
  console.log(`reef

Usage:
  reef "publish posts/hello.md to my wordpress"
  reef skill list
  reef build
  reef posts [--json]
  reef pages [--json]
  reef post read <slug|path|number> [--json]
  reef page read <slug|path|number> [--json]
  reef publish wordpress <slug|path|number> [--draft] [--json]
  reef update wordpress <slug|path|number> [--json]
  reef publish mastodon <slug|path|number> [--visibility public|unlisted|private|direct] [--json]
  reef update mastodon <slug|path|number> [--json]
  reef publish github-pages [--json]
  reef setup wordpress [--project] [--json]
  reef setup mastodon [--project] [--json]
  reef setup github-pages [--project] [--json]
  reef open
  reef open post hello
  reef open page about
`);
}
