export type ParsedMarkdown = {
  frontmatter: Record<string, string>;
  body: string;
  title?: string;
  html: string;
};

export function parseMarkdown(source: string, fallbackTitle: string): ParsedMarkdown {
  const { frontmatter, body } = splitFrontmatter(source);
  const title = frontmatter.title ?? firstMarkdownHeading(body) ?? fallbackTitle;

  return {
    frontmatter,
    body,
    title,
    html: markdownToHtml(body),
  };
}

export function splitFrontmatter(source: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source };
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: {}, body: source };
  }

  const raw = source.slice(4, end);
  const body = source.slice(end + 5);
  const frontmatter: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) {
      frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body };
}

export function firstMarkdownHeading(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return html.join("\n");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text: string, href: string) =>
        `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`,
    );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
