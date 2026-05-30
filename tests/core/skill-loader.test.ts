import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkills } from "../../src/core/skill-loader";
import type { ReefConfig } from "../../src/core/config";
import { createWorkspace } from "../../src/core/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.REEF_ALPHA_TOKEN;
});

describe("loadSkills", () => {
  test("loads valid skills with manifest metadata, config, and env secrets", async () => {
    const root = await tempRoot();
    await writeSkill(root, "alpha", {
      manifestName: "alpha",
      codeName: "alpha",
      version: "1.2.3",
    });
    process.env.REEF_ALPHA_TOKEN = "secret-token";

    const skills = await loadSkills({
      config: config(root, { alpha: { url: "https://example.com" } }),
      workspace: await createWorkspace(root),
      builtInSkillsDir: join(root, "no-builtins"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "alpha",
      version: "1.2.3",
      status: "loaded",
    });
    expect(skills[0].tools.map((tool) => tool.name)).toEqual(["ping"]);
    expect(skills[0].context.config).toEqual({ url: "https://example.com" });
    expect(skills[0].context.secrets).toEqual({ token: "secret-token" });
  });

  test("surfaces manifest/code name mismatch as an error skill", async () => {
    const root = await tempRoot();
    await writeSkill(root, "bad", {
      manifestName: "manifest-name",
      codeName: "code-name",
      version: "0.1.0",
    });

    const skills = await loadSkills({
      config: config(root),
      workspace: await createWorkspace(root),
      builtInSkillsDir: join(root, "no-builtins"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0].status).toBe("error");
    expect(skills[0].name).toBe("bad");
    expect(skills[0].error).toContain("name mismatch");
  });

  test("surfaces duplicate manifest names without dropping the first skill", async () => {
    const root = await tempRoot();
    await writeSkill(root, "alpha-a", {
      manifestName: "alpha",
      codeName: "alpha",
      version: "0.1.0",
    });
    await writeSkill(root, "alpha-b", {
      manifestName: "alpha",
      codeName: "alpha",
      version: "0.1.0",
    });

    const skills = await loadSkills({
      config: config(root),
      workspace: await createWorkspace(root),
      builtInSkillsDir: join(root, "no-builtins"),
    });

    expect(skills.map((skill) => skill.status)).toEqual(["loaded", "error"]);
    expect(skills[1].error).toContain("duplicate skill name");
  });

  test("surfaces missing manifest as an error skill", async () => {
    const root = await tempRoot();
    const dir = join(root, "skills", "missing-manifest");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.ts"), 'export default { name: "missing-manifest", tools: [] };');

    const skills = await loadSkills({
      config: config(root),
      workspace: await createWorkspace(root),
      builtInSkillsDir: join(root, "no-builtins"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "missing-manifest",
      status: "error",
    });
    expect(skills[0].error).toContain("skill.toml");
  });

  test("loads built-in skills when the runtime directory has no local skills", async () => {
    const runtimeRoot = await tempRoot();
    const builtinsRoot = await tempRoot();
    await writeSkill(builtinsRoot, "posts", {
      manifestName: "posts",
      codeName: "posts",
      version: "0.1.0",
    });

    const skills = await loadSkills({
      config: config(runtimeRoot),
      workspace: await createWorkspace(runtimeRoot),
      builtInSkillsDir: join(builtinsRoot, "skills"),
    });

    expect(skills.map((skill) => skill.name)).toEqual(["posts"]);
    expect(skills[0].status).toBe("loaded");
  });

  test("does not import project skills unless the workspace trusts them", async () => {
    const root = await tempRoot();
    await writeSkill(root, "alpha", {
      manifestName: "alpha",
      codeName: "alpha",
      version: "0.1.0",
      moduleBody: 'throw new Error("should not import untrusted skill");',
    });

    const skills = await loadSkills({
      config: config(root, {}, false),
      workspace: await createWorkspace(root),
      builtInSkillsDir: join(root, "no-builtins"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "alpha",
      status: "error",
    });
    expect(skills[0].error).toContain("project skill is not trusted");
    expect(skills[0].error).not.toContain("should not import");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "reef-skills-"));
  roots.push(root);
  return root;
}

async function writeSkill(
  root: string,
  dirName: string,
  input: { manifestName: string; codeName: string; version: string; moduleBody?: string },
): Promise<void> {
  const dir = join(root, "skills", dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "skill.toml"),
    `[skill]\nname = "${input.manifestName}"\nversion = "${input.version}"\n`,
  );
  await writeFile(
    join(dir, "index.ts"),
    input.moduleBody ??
      [
        "export default {",
        `  name: "${input.codeName}",`,
        '  systemPrompt: "alpha prompt",',
        "  tools: [{",
        '    name: "ping",',
        '    description: "Ping the skill.",',
        '    inputSchema: { type: "object", properties: {} },',
        '    run: async () => "pong",',
        "  }],",
        "};",
      ].join("\n"),
  );
}

function config(
  root: string,
  skillConfig: ReefConfig["skillConfig"] = {},
  trustProjectSkills = true,
): ReefConfig {
  return {
    root,
    title: "Test",
    domain: "",
    anthropicKeyEnv: "ANTHROPIC_API_KEY",
    trustProjectSkills,
    skillConfig,
    globalAccounts: {},
  };
}
