#!/usr/bin/env bun

import { runAgentOnce } from "../src/core/agent";
import { buildSite } from "../src/core/build";
import { loadConfig } from "../src/core/config";
import { loadSkills } from "../src/core/skill-loader";
import { createWorkspace } from "../src/core/workspace";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command) {
    printUsage();
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
  const config = await loadConfig(process.cwd());
  const workspace = await createWorkspace(process.cwd());
  const skills = await loadSkills({ config, workspace });

  const result = await runAgentOnce({
    prompt,
    skills,
    anthropicApiKey: process.env[config.anthropicKeyEnv],
    model: process.env.CLAUDE_MODEL ?? "claude-opus-4-7",
  });

  if (result.trim()) {
    console.log(result);
  }
}

async function build(): Promise<void> {
  const config = await loadConfig(process.cwd());
  const workspace = await createWorkspace(process.cwd());
  const result = await buildSite({
    title: config.title,
    domain: config.domain,
    workspace,
  });

  console.log(`Built ${result.files.length} files into dist/.`);
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

function printUsage(): void {
  console.log(`reef

Usage:
  reef "publish posts/hello.md to my wordpress"
  reef skill list
  reef build
`);
}
