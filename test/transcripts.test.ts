import { describe, expect, test } from "vitest";
import { loadTranscripts } from "../src/transcripts.ts";
import { assistant, prompt, writeProjectsDir } from "./support/transcripts.ts";

describe("loadTranscripts", () => {
  test("skips blank and half-written lines from a session still being recorded", async () => {
    const projectsDir = writeProjectsDir([
      {
        project: "p",
        sessionId: "live",
        records: [prompt({ at: "2026-10-01T09:00:00Z" }), "", '{"type":"assist'],
      },
    ]);

    const [session] = await loadTranscripts(projectsDir);

    expect(session?.records).toHaveLength(1);
  });

  test("loads each session's subagent transcripts with it", async () => {
    const projectsDir = writeProjectsDir([
      {
        project: "p",
        sessionId: "parent",
        records: [prompt({ at: "2026-10-01T09:00:00Z" })],
        subagents: [[assistant({ at: "2026-10-01T09:01:00Z" })]],
      },
    ]);

    const sessions = await loadTranscripts(projectsDir);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.subagents.map((s) => s.records.length)).toEqual([1]);
  });

  test("a subagent's type comes from its meta file, else it is unknown", async () => {
    const projectsDir = writeProjectsDir([
      {
        project: "p",
        sessionId: "parent",
        records: [prompt({ at: "2026-10-01T09:00:00Z" })],
        subagents: [[assistant({ at: "2026-10-01T09:01:00Z" })]],
        agents: [
          { agentType: "plan-conformance", records: [assistant({ at: "2026-10-01T09:02:00Z" })] },
        ],
      },
    ]);

    const [session] = await loadTranscripts(projectsDir);

    expect(session?.subagents.map((s) => s.agentType).sort()).toEqual([
      "plan-conformance",
      "unknown",
    ]);
  });
});
