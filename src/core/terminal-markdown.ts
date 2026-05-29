export function renderTerminalMarkdown(
  markdown: string,
  options: { colors?: boolean } = {},
): string {
  const colors = options.colors ?? true;
  const lines = markdown.trim().split(/\r?\n/);
  const rendered: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      rendered.push(`  ${line}`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      rendered.push(style(stripInlineMarkdown(heading[2]), "bold", colors));
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      rendered.push(`• ${stripInlineMarkdown(bullet[1])}`);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      rendered.push(`• ${stripInlineMarkdown(numbered[1])}`);
      continue;
    }

    rendered.push(stripInlineMarkdown(line));
  }

  return rendered.join("\n");
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

function style(value: string, kind: "bold", enabled: boolean): string {
  if (!enabled) {
    return value;
  }
  if (kind === "bold") {
    return `\u001b[1m${value}\u001b[22m`;
  }
  return value;
}
