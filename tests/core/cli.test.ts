import { describe, expect, test } from "bun:test";

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
});
