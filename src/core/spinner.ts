export type Spinner = {
  start(): void;
  stop(finalMessage?: string): void;
};

type WritableStream = {
  write(chunk: string): unknown;
};

export function createSpinner(
  label: string,
  options: {
    enabled?: boolean;
    stream?: WritableStream;
    frames?: string[];
    intervalMs?: number;
  } = {},
): Spinner {
  const enabled = options.enabled ?? true;
  const stream = options.stream ?? process.stderr;
  const frames = options.frames ?? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const intervalMs = options.intervalMs ?? 80;
  let frameIndex = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    const frame = frames[frameIndex % frames.length];
    frameIndex += 1;
    stream.write(`\r\u001b[2K${label} ${frame}`);
  };

  return {
    start() {
      if (!enabled || timer) {
        return;
      }
      render();
      timer = setInterval(render, intervalMs);
    },
    stop(finalMessage?: string) {
      if (!enabled || !timer) {
        return;
      }
      clearInterval(timer);
      timer = null;
      stream.write(finalMessage ? `\r\u001b[2K${finalMessage}\n` : "\r\u001b[2K");
    },
  };
}
