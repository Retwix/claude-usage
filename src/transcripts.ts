import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const UsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  cache_creation: z.object({
    ephemeral_5m_input_tokens: z.number(),
    ephemeral_1h_input_tokens: z.number(),
  }),
  output_tokens_details: z.object({ thinking_tokens: z.number() }).optional(),
});

export const TranscriptRecordSchema = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  requestId: z.string().optional(),
  origin: z.object({ kind: z.string() }).nullish(),
  message: z
    .object({
      id: z.string().optional(),
      model: z.string().optional(),
      content: z.union([z.string(), z.array(z.unknown())]).optional(),
      usage: UsageSchema.optional(),
    })
    .optional(),
});

export type TranscriptRecord = z.infer<typeof TranscriptRecordSchema>;

export type TokenUsage = z.infer<typeof UsageSchema>;

export type Subagent = {
  readonly agentType: string;
  readonly records: ReadonlyArray<TranscriptRecord>;
};

const AgentMetaSchema = z.object({ agentType: z.string() });

export type TranscriptSession = {
  readonly project: string;
  readonly sessionId: string;
  readonly records: ReadonlyArray<TranscriptRecord>;
  readonly subagents: ReadonlyArray<Subagent>;
};

const parseLine = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

const parseJsonl = (text: string): ReadonlyArray<TranscriptRecord> =>
  text.split("\n").flatMap((line) => {
    const parsed = TranscriptRecordSchema.safeParse(parseLine(line));
    return parsed.success ? [parsed.data] : [];
  });

const jsonlFiles = async (dir: string): Promise<ReadonlyArray<string>> =>
  (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".jsonl"));

const loadJsonl = async (path: string) => parseJsonl(await readFile(path, "utf8"));

const agentTypeOf = async (transcriptPath: string): Promise<string> => {
  const meta = await readFile(transcriptPath.replace(/\.jsonl$/, ".meta.json"), "utf8").catch(
    () => "",
  );
  const parsed = AgentMetaSchema.safeParse(parseLine(meta));
  return parsed.success ? parsed.data.agentType : "unknown";
};

const loadSubagent = async (path: string): Promise<Subagent> => ({
  agentType: await agentTypeOf(path),
  records: await loadJsonl(path),
});

const loadSession = async (projectDir: string, project: string, file: string) => {
  const sessionId = file.replace(/\.jsonl$/, "");
  const subagentDir = join(projectDir, sessionId, "subagents");
  return {
    project,
    sessionId,
    records: await loadJsonl(join(projectDir, file)),
    subagents: await Promise.all(
      (await jsonlFiles(subagentDir)).map((f) => loadSubagent(join(subagentDir, f))),
    ),
  };
};

const loadProject = async (projectsDir: string, project: string) => {
  const projectDir = join(projectsDir, project);
  const files = await jsonlFiles(projectDir);
  return Promise.all(files.map((file) => loadSession(projectDir, project, file)));
};

export const loadTranscripts = async (
  projectsDir: string,
): Promise<ReadonlyArray<TranscriptSession>> => {
  const projects = await readdir(projectsDir);
  return (await Promise.all(projects.map((p) => loadProject(projectsDir, p)))).flat();
};
