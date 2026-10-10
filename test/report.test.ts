import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { buildReport } from "../src/report.ts";
import { cyclePrompt, writeProjectsDir } from "./support/transcripts.ts";

describe("buildReport", () => {
  test("each range holds the sessions active within it, and the last 30 days shows first", async () => {
    const projectsDir = writeProjectsDir([
      {
        project: "-home-me-Code-acme",
        sessionId: "s1",
        records: [cyclePrompt({ slug: "new-templates", at: "2026-10-01T12:00:00Z" })],
      },
      {
        project: "-home-me-Code-acme",
        sessionId: "s2",
        records: [cyclePrompt({ slug: "old-task", at: "2026-08-30T12:00:00Z" })],
      },
    ]);

    const html = await buildReport({
      projectsDir,
      skillsDir: `${projectsDir}/no-skills-here`,
      now: new Date("2026-10-09T12:00:00Z"),
    });

    const { document } = new JSDOM(html).window;
    const featuresIn = (range: string) =>
      [...document.querySelectorAll(`section[data-range="${range}"] tr[data-feature]`)].map((tr) =>
        tr.getAttribute("data-feature"),
      );
    expect([featuresIn("7d"), featuresIn("30d"), featuresIn("all").sort()]).toEqual([
      [],
      ["new-templates"],
      ["new-templates", "old-task"],
    ]);
    expect(
      [...document.querySelectorAll("section.range:not([hidden])")].map((s) =>
        s.getAttribute("data-range"),
      ),
    ).toEqual(["30d"]);
  });
});
