import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { type Report, renderReport } from "../src/render.ts";
import type { FeatureUsage, RepoUsage, UsageSummary, WeekUsage } from "../src/usage.ts";

const repoUsage = (
  repo: string,
  costUsd: number,
  hours: number,
  overrides: Partial<RepoUsage> = {},
): RepoUsage => ({
  repo,
  costUsd,
  activeSeconds: hours * 3600,
  waitingSeconds: 0,
  largeContextCostUsd: 0,
  cyclingSavingsUsd: 0,
  thinkingCostUsd: 0,
  cacheReadCostUsd: 0,
  cacheWriteCostUsd: 0,
  inputCostUsd: 0,
  answerCostUsd: 0,
  standingCostPer10kUsd: 0,
  ...overrides,
});

const sumOf = (repos: ReadonlyArray<RepoUsage>, key: keyof Omit<RepoUsage, "repo">) =>
  repos.reduce((total, r) => total + r[key], 0);

const featureUsage = (overrides: Partial<FeatureUsage> = {}): FeatureUsage => {
  const repos = overrides.repos ?? [repoUsage("acme-backend", 1, 1)];
  return {
    feature: "auth",
    sessions: 1,
    prompts: 1,
    activeSeconds: sumOf(repos, "activeSeconds"),
    waitingSeconds: sumOf(repos, "waitingSeconds"),
    costUsd: sumOf(repos, "costUsd"),
    largeContextCostUsd: sumOf(repos, "largeContextCostUsd"),
    cyclingSavingsUsd: sumOf(repos, "cyclingSavingsUsd"),
    thinkingCostUsd: sumOf(repos, "thinkingCostUsd"),
    cacheReadCostUsd: sumOf(repos, "cacheReadCostUsd"),
    cacheWriteCostUsd: sumOf(repos, "cacheWriteCostUsd"),
    inputCostUsd: sumOf(repos, "inputCostUsd"),
    answerCostUsd: sumOf(repos, "answerCostUsd"),
    standingCostPer10kUsd: sumOf(repos, "standingCostPer10kUsd"),
    endContextTokens: 100_000,
    friction: {
      denied: 0,
      staleEdits: 0,
      editMismatches: 0,
      guardrailBlocks: 0,
      autoModeBlocks: 0,
      safetyCheckUnavailable: 0,
      zshTraps: 0,
      missingToolVersions: 0,
      browserErrors: 0,
      missingFiles: 0,
      serviceErrors: 0,
      failedCommands: 0,
      interruptions: 0,
    },
    firstActive: "2026-10-01T09:00:00.000Z",
    lastActive: "2026-10-01T09:01:00.000Z",
    ...overrides,
    repos,
  };
};

const GENERATED_AT = new Date("2026-10-09T12:00:00Z");

const twoFeatures = (): UsageSummary => ({
  features: [
    featureUsage({
      feature: "auth",
      sessions: 3,
      prompts: 30,
      repos: [repoUsage("acme-backend", 40, 2), repoUsage("acme-frontend", 20, 1)],
    }),
    featureUsage({
      feature: "design",
      sessions: 1,
      prompts: 5,
      repos: [repoUsage("acme-docs", 30, 1)],
    }),
  ],
  unpricedModels: [],
  sessionStartTokens: undefined,
  skills: [],
  agents: [],
  weekdays: [],
});

const oneRange = (summary: UsageSummary, weeks: ReadonlyArray<WeekUsage> = []): Report => ({
  ranges: [{ id: "30d", label: "Last 30 days", summary }],
  selectedRange: "30d",
  weeks,
  installedSkills: [],
});

const openPage = (report: Report, storage: ReadonlyMap<string, string> = new Map()) => {
  const dom = new JSDOM(renderReport(report, { generatedAt: GENERATED_AT }), {
    runScripts: "dangerously",
    url: "http://localhost/",
    beforeParse: (window) => {
      storage.forEach((value, key) => {
        window.localStorage.setItem(key, value);
      });
    },
  });
  const { document, localStorage } = dom.window;
  const shownRange = () => document.querySelector("section.range:not([hidden])");
  const headers = () =>
    [...(shownRange()?.querySelectorAll("th") ?? [])].map((th) => th.textContent?.trim() ?? "");
  const shownRows = () =>
    [...(shownRange()?.querySelectorAll<HTMLTableRowElement>("tbody tr") ?? [])].filter(
      (tr) => !tr.hidden,
    );
  const text = (el: Element | null | undefined) => el?.textContent?.trim();
  const press = (selector: string, label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(selector)]
      .find((button) => text(button) === label)
      ?.click();
  return {
    toggle: (repo: string) => press(".legend button", repo),
    chooseRange: (label: string) => press(".ranges button", label),
    standsOut: () =>
      [...(shownRange()?.querySelectorAll<HTMLLIElement>(".insights li") ?? [])]
        .filter((li) => !li.hidden)
        .map((li) => text(li)),
    weekCompare: () => text(document.querySelector(".week-compare")),
    costBreakdown: () =>
      [...(shownRange()?.querySelectorAll(".donut-legend li") ?? [])].map((li) => text(li)),
    weekday: (label: string) =>
      [...(shownRange()?.querySelectorAll(".day") ?? [])]
        .filter((day) => text(day.querySelector(".day-label")) === label)
        .map((day) => [
          text(day.querySelector(".day-cost")),
          text(day.querySelector(".day-active")),
        ]),
    weekTotal: (weekStart: string) =>
      text(document.querySelector(`[data-week="${weekStart}"] .week-total`)),
    features: () => shownRows().map((tr) => tr.dataset["feature"]),
    cell: (feature: string, header: string) =>
      text(
        shownRows().find((tr) => tr.dataset["feature"] === feature)?.cells[
          headers().findIndex((h) => h.startsWith(header))
        ],
      ),
    total: (label: string) =>
      text(
        [...(shownRange()?.querySelectorAll(".tile") ?? [])]
          .find((tile) => text(tile.querySelector(".label")) === label)
          ?.querySelector(".value"),
      ),
    storage: () =>
      new Map(
        Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").map(
          (key) => [key, localStorage.getItem(key) ?? ""],
        ),
      ),
  };
};

describe("renderReport", () => {
  test("shows a feature name containing markup as text", () => {
    const html = renderReport(
      oneRange({
        features: [featureUsage({ feature: `<img src=x onerror="alert('hi')">` })],
        unpricedModels: [],
        sessionStartTokens: undefined,
        skills: [],
        agents: [],
        weekdays: [],
      }),
      { generatedAt: GENERATED_AT },
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&#60;img src=x onerror=&#34;alert(&#39;hi&#39;)&#34;&#62;");
  });
});

describe("the page: hiding repos", () => {
  test("hiding a repo takes its cost and time out of every feature and the totals", () => {
    const page = openPage(oneRange(twoFeatures()));

    page.toggle("acme-frontend");

    expect([page.cell("auth", "Cost"), page.cell("auth", "Active")]).toEqual(["$40", "2.0 h"]);
    expect([page.total("API-equivalent cost"), page.total("Active time")]).toEqual([
      "$70",
      "3.0 h",
    ]);
  });

  test("a feature with every repo hidden leaves the table, with its sessions and prompts", () => {
    const page = openPage(oneRange(twoFeatures()));

    page.toggle("acme-docs");

    expect(page.features()).toEqual(["auth"]);
    expect([page.total("Sessions"), page.total("Prompts")]).toEqual(["3", "30"]);
  });

  test("clicking a hidden repo again brings it back", () => {
    const page = openPage(oneRange(twoFeatures()));

    page.toggle("acme-frontend");
    page.toggle("acme-frontend");

    expect(page.cell("auth", "Cost")).toBe("$60");
  });

  test("rows stay in cost order once a repo is hidden", () => {
    const page = openPage(oneRange(twoFeatures()));

    page.toggle("acme-backend");

    expect(page.features()).toEqual(["design", "auth"]);
  });

  test("the next time the page opens, the same repos are still hidden", () => {
    const first = openPage(oneRange(twoFeatures()));
    first.toggle("acme-docs");

    const next = openPage(oneRange(twoFeatures()), first.storage());

    expect(next.features()).toEqual(["auth"]);
  });
});

describe("the page: date ranges", () => {
  const twoRanges = (): Report => ({
    ranges: [
      {
        id: "7d",
        label: "Last 7 days",
        summary: {
          features: [featureUsage({ feature: "auth", repos: [repoUsage("acme-backend", 15, 1)] })],
          unpricedModels: [],
          sessionStartTokens: undefined,
          skills: [],
          agents: [],
          weekdays: [],
        },
      },
      { id: "30d", label: "Last 30 days", summary: twoFeatures() },
    ],
    selectedRange: "30d",
    weeks: [],
    installedSkills: [],
  });

  test("choosing a range shows that period's features and totals", () => {
    const page = openPage(twoRanges());

    page.chooseRange("Last 7 days");

    expect(page.features()).toEqual(["auth"]);
    expect(page.total("API-equivalent cost")).toBe("$15");
  });

  test("the next time the page opens, the same range is chosen", () => {
    const first = openPage(twoRanges());
    first.chooseRange("Last 7 days");

    const next = openPage(twoRanges(), first.storage());

    expect(next.features()).toEqual(["auth"]);
  });

  test("a hidden repo stays hidden in every range", () => {
    const page = openPage(twoRanges());

    page.toggle("acme-backend");
    page.chooseRange("Last 7 days");

    expect(page.features()).toEqual([]);
  });
});

describe("the page: shares follow the repos shown", () => {
  test("large-context and your-turn shares are recalculated when a repo is hidden", () => {
    const page = openPage(
      oneRange({
        features: [
          featureUsage({
            feature: "auth",
            repos: [
              repoUsage("acme-backend", 40, 2, { largeContextCostUsd: 40, waitingSeconds: 3600 }),
              repoUsage("acme-frontend", 20, 2, { waitingSeconds: 1800 }),
            ],
          }),
        ],
        unpricedModels: [],
        sessionStartTokens: undefined,
        skills: [],
        agents: [],
        weekdays: [],
      }),
    );

    page.toggle("acme-frontend");

    expect([page.cell("auth", "Above 200k"), page.cell("auth", "Your turn")]).toEqual([
      "100%",
      "50%",
    ]);
    expect(page.total("Cost above 200k context")).toBe("100%");
  });
});

describe("the page: weekly chart", () => {
  test("each week's total leaves out hidden repos", () => {
    const page = openPage(
      oneRange(twoFeatures(), [
        {
          weekStart: "2026-09-28",
          repos: [repoUsage("acme-backend", 40, 2), repoUsage("acme-docs", 20, 1)],
        },
      ]),
    );

    page.toggle("acme-docs");

    expect(page.weekTotal("2026-09-28")).toBe("$40");
  });
});

describe("the page: by day of the week", () => {
  test("each day's cost and active time leave out hidden repos", () => {
    const wednesday = [repoUsage("acme-backend", 40, 2), repoUsage("acme-docs", 20, 1)];
    const page = openPage(
      oneRange({
        ...twoFeatures(),
        weekdays: [[], [], [{ date: "2026-09-30", repos: wednesday }], [], [], [], []].map(
          (days) => ({ days }),
        ),
      }),
    );

    page.toggle("acme-docs");

    expect(page.weekday("Wed")).toEqual([["$40", "2.0 h"]]);
  });
});

describe("the page: what stands out", () => {
  test("the cycling estimate leaves out hidden repos", () => {
    const page = openPage(
      oneRange({
        features: [
          featureUsage({
            repos: [
              repoUsage("acme-backend", 100, 2, { cyclingSavingsUsd: 30 }),
              repoUsage("acme-frontend", 100, 2, { cyclingSavingsUsd: 10 }),
            ],
          }),
        ],
        unpricedModels: [],
        sessionStartTokens: undefined,
        skills: [],
        agents: [],
        weekdays: [],
      }),
    );

    page.toggle("acme-frontend");

    expect(page.standsOut()[0]).toContain("$30 (30% of cost)");
  });

  test("a feature named for its cost per prompt leaves the panel when its repos are hidden", () => {
    const perPrompt = (feature: string, repo: string, dollars: number) =>
      featureUsage({ feature, prompts: 20, repos: [repoUsage(repo, dollars * 20, 1)] });
    const page = openPage(
      oneRange({
        features: [
          perPrompt("design", "acme-docs", 6),
          perPrompt("auth", "acme-backend", 2),
          perPrompt("billing", "acme-backend", 2),
        ],
        unpricedModels: [],
        sessionStartTokens: undefined,
        skills: [],
        agents: [],
        weekdays: [],
      }),
    );
    const namesDesign = () => page.standsOut().some((line) => line?.startsWith("design"));
    const before = namesDesign();

    page.toggle("acme-docs");

    expect([before, namesDesign()]).toEqual([true, false]);
  });
});

describe("the page: weekly comparison", () => {
  test("the chart compares the latest week with the one before, without hidden repos", () => {
    const page = openPage(
      oneRange(twoFeatures(), [
        {
          weekStart: "2026-09-28",
          repos: [repoUsage("acme-backend", 40, 2), repoUsage("acme-docs", 20, 1)],
        },
        { weekStart: "2026-10-05", repos: [repoUsage("acme-backend", 10, 1)] },
      ]),
    );

    page.toggle("acme-docs");

    expect(page.weekCompare()).toBe("latest week $10 · week before $40");
  });
});

describe("the page: context and tools", () => {
  test("the standing-context and thinking figures leave out hidden repos", () => {
    const page = openPage(
      oneRange({
        features: [
          featureUsage({
            repos: [
              repoUsage("acme-backend", 100, 2, { standingCostPer10kUsd: 50, thinkingCostUsd: 12 }),
              repoUsage("acme-frontend", 100, 2, { standingCostPer10kUsd: 30, thinkingCostUsd: 8 }),
            ],
          }),
        ],
        unpricedModels: [],
        sessionStartTokens: 54_000,
        skills: [],
        agents: [],
        weekdays: [],
      }),
    );

    page.toggle("acme-frontend");

    expect(page.standsOut().some((line) => line?.includes("about $50"))).toBe(true);
    expect(page.total("Thinking")).toBe("$12");
  });

  test("names the installed skills that no session in the range loaded", () => {
    const page = openPage({
      ...oneRange({
        features: [featureUsage()],
        unpricedModels: [],
        sessionStartTokens: 54_000,
        skills: [{ skill: "tdd", loads: 3, tokens: 4_000, rereadCostUsd: 2 }],
        agents: [],
        weekdays: [],
      }),
      installedSkills: ["tdd", "diagrams"],
    });

    expect(page.standsOut().some((line) => line?.includes("never loaded: diagrams"))).toBe(true);
  });
});

describe("the page: where the cost goes", () => {
  test("the breakdown by kind of cost leaves out hidden repos", () => {
    const page = openPage(
      oneRange({
        features: [
          featureUsage({
            repos: [
              repoUsage("acme-backend", 100, 2, {
                cacheReadCostUsd: 60,
                cacheWriteCostUsd: 30,
                answerCostUsd: 6,
                thinkingCostUsd: 4,
              }),
              repoUsage("acme-frontend", 100, 2, {
                cacheReadCostUsd: 90,
                cacheWriteCostUsd: 10,
              }),
            ],
          }),
        ],
        unpricedModels: [],
        sessionStartTokens: undefined,
        skills: [],
        agents: [],
        weekdays: [],
      }),
    );

    page.toggle("acme-frontend");

    expect(page.costBreakdown()).toEqual([
      "Re-reading the conversation $60 · 60%",
      "Storing new context $30 · 30%",
      "Answers and code $6.00 · 6%",
      "Thinking $4.00 · 4%",
      "Uncached input $0.00 · 0%",
    ]);
  });
});
