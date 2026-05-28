export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  items?: JsonSchema;
};

export type ToolContext = {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  workspace: WorkspaceAPI;
};

export type ToolResult = string | { text: string; data?: unknown };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

export type SkillDef = {
  name: string;
  tools: ToolDef[];
  systemPrompt?: string;
};

export type PostMeta = {
  slug: string;
  path: string;
  title?: string;
  date?: string;
};

export type PageMeta = {
  slug: string;
  path: string;
  title?: string;
};

export type WorkspaceAPI = {
  root: string;
  listPosts(): Promise<PostMeta[]>;
  readPost(slugOrPath: string): Promise<string | null>;
  writePost(slug: string, markdown: string): Promise<void>;
  createPost(slug: string, date: string, body: string, title?: string): Promise<void>;
  deletePost(slug: string): Promise<void>;
  listPages(): Promise<PageMeta[]>;
  readPage(slugOrPath: string): Promise<string | null>;
  writePage(slug: string, markdown: string): Promise<void>;
  createPage(slug: string): Promise<void>;
  deletePage(slug: string): Promise<void>;
  listMedia(): Promise<string[]>;
  readMedia(filename: string): Promise<Uint8Array | null>;
  writeMedia(filename: string, bytes: Uint8Array): Promise<void>;
  deleteMedia(filename: string): Promise<void>;
  search(query: string): Promise<{ kind: "post" | "page"; slug: string }[]>;
  backlinks(slug: string): Promise<string[]>;
  skillState: {
    read(skillName: string, key: string): Promise<unknown>;
    write(skillName: string, key: string, value: unknown): Promise<void>;
  };
};

export function defineSkill(def: SkillDef): SkillDef {
  return def;
}

export function defineTool(def: ToolDef): ToolDef {
  return def;
}
