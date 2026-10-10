import { readdir } from "node:fs/promises";
import { renderReport } from "./render.ts";
import { loadTranscripts } from "./transcripts.ts";
import { prepareUsage } from "./usage.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const installedSkills = async (skillsDir: string): Promise<ReadonlyArray<string>> =>
  (await readdir(skillsDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

export const buildReport = async ({
  projectsDir,
  skillsDir,
  now,
}: {
  readonly projectsDir: string;
  readonly skillsDir: string;
  readonly now: Date;
}): Promise<string> => {
  const usage = prepareUsage(await loadTranscripts(projectsDir));
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return renderReport(
    {
      ranges: [
        {
          id: "7d",
          label: "Last 7 days",
          summary: usage.summary({ since: daysAgo(7) }),
        },
        {
          id: "30d",
          label: "Last 30 days",
          summary: usage.summary({ since: daysAgo(30) }),
        },
        { id: "all", label: "All", summary: usage.summary() },
      ],
      selectedRange: "30d",
      weeks: usage.weeks(),
      installedSkills: await installedSkills(skillsDir),
    },
    { generatedAt: now },
  );
};
