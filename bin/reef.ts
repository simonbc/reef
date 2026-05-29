#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { runAgentOnce, type AgentEvent, type ChatTurn } from "../src/core/agent";
import { buildSite } from "../src/core/build";
import { runCliHarness } from "../src/core/cli-harness";
import { loadConfig } from "../src/core/config";
import { createHarnessApp } from "../src/core/harness";
import { loadSkills } from "../src/core/skill-loader";
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
) {
  onEvent?.({ type: "phase", message: "Loading config" });
  const config = await loadConfig(process.cwd());
  onEvent?.({ type: "phase", message: "Loading workspace" });
  const workspace = await createWorkspace(process.cwd());
  onEvent?.({ type: "phase", message: "Loading skills" });
  const skills = await loadSkills({ config, workspace });

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
    await runCliHarness({
      prompts: readline,
      output: process.stdout,
      runPrompt: runPromptText,
      runBuild: buildText,
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
`);
}
