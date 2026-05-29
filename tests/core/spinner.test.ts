import { afterEach, describe, expect, test } from "bun:test";
import { createSpinner } from "../../src/core/spinner";

const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

afterEach(() => {
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
});

describe("createSpinner", () => {
  test("writes start, tick, and stop frames to the stream", () => {
    const writes: string[] = [];
    let intervalCallback: (() => void) | null = null;
    let cleared = false;

    globalThis.setInterval = ((callback: () => void) => {
      intervalCallback = callback;
      return 123 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      expect(id).toBe(123 as unknown as ReturnType<typeof setInterval>);
      cleared = true;
    }) as typeof clearInterval;

    const spinner = createSpinner("Thinking", {
      stream: { write: (chunk: string) => writes.push(chunk) },
      frames: ["a", "b"],
      intervalMs: 10,
    });

    spinner.start();
    intervalCallback?.();
    spinner.stop("Done");

    expect(writes).toEqual([
      "\r\u001b[2KThinking a",
      "\r\u001b[2KThinking b",
      "\r\u001b[2KDone\n",
    ]);
    expect(cleared).toBe(true);
  });

  test("does nothing when disabled", () => {
    const writes: string[] = [];
    const spinner = createSpinner("Thinking", {
      enabled: false,
      stream: { write: (chunk: string) => writes.push(chunk) },
    });

    spinner.start();
    spinner.stop("Done");

    expect(writes).toEqual([]);
  });
});
