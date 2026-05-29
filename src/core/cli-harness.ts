import type { Spinner } from "./spinner";
import { renderTerminalMarkdown } from "./terminal-markdown";
import type { AgentEvent, ChatTurn } from "./agent";
import type { OpenTarget } from "./open";
import { formatContentList } from "./content-commands";
import type { PageMeta, PostMeta } from "../skill-api";

type Writable = {
  write(chunk: string): unknown;
};

export type CliHarnessOptions = {
  prompts: AsyncIterable<string>;
  output: Writable;
  runPrompt: (
    prompt: string,
    history: ChatTurn[],
    onEvent: (event: AgentEvent) => void,
  ) => Promise<string>;
  runBuild?: () => Promise<string>;
  runOpen?: (args: string[]) => Promise<OpenTarget>;
  listPosts?: () => Promise<PostMeta[]>;
  listPages?: () => Promise<PageMeta[]>;
  openTarget?: (target: OpenTarget) => Promise<void> | void;
  spinnerFactory: (label: string) => Spinner;
};

export async function runCliHarness(options: CliHarnessOptions): Promise<void> {
  const history: ChatTurn[] = [];
  let debug = false;
  options.output.write("> ");

  for await (const rawPrompt of options.prompts) {
    const prompt = rawPrompt.trim();

    if (prompt === "exit" || prompt === "quit" || prompt === "/exit" || prompt === "/quit") {
      return;
    }

    if (!prompt) {
      options.output.write("> ");
      continue;
    }

    if (prompt === "/debug on") {
      debug = true;
      options.output.write("Debug output on.\n> ");
      continue;
    }

    if (prompt === "/debug off") {
      debug = false;
      options.output.write("Debug output off.\n> ");
      continue;
    }

    if (prompt === "/build") {
      const result = options.runBuild
        ? await options.runBuild()
        : "No build command is available.";
      options.output.write(`${result}\n> `);
      continue;
    }

    if (prompt === "/posts") {
      if (!options.listPosts) {
        options.output.write("No posts command is available.\n> ");
        continue;
      }
      options.output.write(`${formatContentList(await options.listPosts(), "posts")}\n> `);
      continue;
    }

    if (prompt === "/pages") {
      if (!options.listPages) {
        options.output.write("No pages command is available.\n> ");
        continue;
      }
      options.output.write(`${formatContentList(await options.listPages(), "pages")}\n> `);
      continue;
    }

    if (prompt === "/open" || prompt.startsWith("/open ")) {
      if (!options.runOpen || !options.openTarget) {
        options.output.write("No open command is available.\n> ");
        continue;
      }

      try {
        const target = await options.runOpen(prompt.split(/\s+/).slice(1));
        await options.openTarget(target);
        options.output.write(`${openedMessage(target)}\n> `);
      } catch (error) {
        options.output.write(`${error instanceof Error ? error.message : String(error)}\n> `);
      }
      continue;
    }

    const spinner = options.spinnerFactory("Thinking");
    spinner.start();
    const showEvent = (event: AgentEvent) => {
      spinner.stop();
      options.output.write(`${formatAgentEvent(event, debug)}\n`);
      spinner.start();
    };

    try {
      const result = await options.runPrompt(prompt, [...history], showEvent);
      spinner.stop();
      if (result.trim()) {
        options.output.write(`${renderTerminalMarkdown(result, { colors: false })}\n`);
      }
      history.push({ role: "user", content: prompt });
      history.push({ role: "assistant", content: result });
    } catch (error) {
      spinner.stop("Stopped");
      options.output.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }

    options.output.write("> ");
  }
}

function openedMessage(target: OpenTarget): string {
  if (target.type === "file") {
    return `Opened ${target.path}`;
  }
  return `Opened ${target.url}`;
}

function formatAgentEvent(event: AgentEvent, debug: boolean): string {
  if (event.type === "phase") {
    return debug ? `  phase ${event.message}` : `  ${event.message}...`;
  }

  if (event.type === "tool_start") {
    return debug
      ? `  tool ${event.name} ${truncate(JSON.stringify(event.input))}`
      : `  ${humanToolName(event.name)}...`;
  }

  if (event.type === "tool_result") {
    return debug
      ? `  result ${event.name} ${truncate(event.result)}`
      : `  ${humanToolName(event.name)} done`;
  }

  return debug
    ? `  error ${event.name} ${truncate(event.error)}`
    : `  ${humanToolName(event.name)} failed`;
}

function humanToolName(name: string): string {
  const [skill, ...rest] = name.split("_");
  const tool = rest.join("_");
  return tool ? `${skill}.${tool}` : name;
}

function truncate(text: string | undefined): string {
  if (!text) {
    return "";
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
