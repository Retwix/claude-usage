import { describe, expect, test } from "vitest";
import { insightsOf, unusedSkills } from "../src/insights.ts";
import type { FeatureUsage, Friction } from "../src/usage.ts";

const NO_FRICTION: Friction = {
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
};

const featureUsage = (overrides: Partial<FeatureUsage> = {}): FeatureUsage => ({
  feature: "auth",
  sessions: 1,
  prompts: 100,
  activeSeconds: 3600,
  waitingSeconds: 0,
  costUsd: 100,
  largeContextCostUsd: 0,
  cyclingSavingsUsd: 0,
  thinkingCostUsd: 0,
  cacheReadCostUsd: 0,
  cacheWriteCostUsd: 0,
  inputCostUsd: 0,
  answerCostUsd: 0,
  standingCostPer10kUsd: 0,
  endContextTokens: 100_000,
  friction: NO_FRICTION,
  firstActive: "2026-10-01T09:00:00.000Z",
  lastActive: "2026-10-01T10:00:00.000Z",
  repos: [],
  ...overrides,
});

const costingPerPrompt = (feature: string, perPrompt: number, prompts = 100) =>
  featureUsage({ feature, prompts, costUsd: perPrompt * prompts });

describe("insightsOf: features costing most per prompt", () => {
  test("names up to two features well above the median, costliest first, with why", () => {
    const { costliestPerPrompt } = insightsOf([
      costingPerPrompt("graph", 3.6),
      featureUsage({
        feature: "design",
        prompts: 86,
        sessions: 2,
        costUsd: 86 * 4.8,
        endContextTokens: 591_000,
      }),
      costingPerPrompt("charts", 3.2),
      costingPerPrompt("auth", 1.2),
      costingPerPrompt("tier5", 0.9),
      costingPerPrompt("templates", 1.3),
      costingPerPrompt("tiny", 20, 19),
    ]);

    expect(costliestPerPrompt).toEqual([
      {
        feature: "design",
        costPerPrompt: 4.8,
        timesMedian: 4.8 / 2.25,
        promptsPerSession: 43,
        endContextTokens: 591_000,
      },
      expect.objectContaining({ feature: "graph", costPerPrompt: 3.6 }),
    ]);
  });

  test.for([
    { reason: "exactly 1.5 times the median", top: 3, named: ["top"] },
    { reason: "just under 1.5 times the median", top: 2.99, named: [] },
  ])("a feature at $reason is named: $named", ({ top, named }) => {
    const { costliestPerPrompt } = insightsOf([
      costingPerPrompt("a", 1),
      costingPerPrompt("top", top),
      costingPerPrompt("b", 2),
    ]);

    expect(costliestPerPrompt.map((c) => c.feature)).toEqual(named);
  });
});

describe("insightsOf: real friction", () => {
  test("lists the kinds that happened, most frequent first, and the feature with the most", () => {
    const { friction } = insightsOf([
      featureUsage({
        feature: "b",
        friction: { ...NO_FRICTION, failedCommands: 3, staleEdits: 1 },
      }),
      featureUsage({ feature: "a", friction: { ...NO_FRICTION, failedCommands: 2, denied: 3 } }),
    ]);

    expect(friction).toEqual({
      kinds: [
        { kind: "failedCommands", count: 5 },
        { kind: "denied", count: 3 },
        { kind: "staleEdits", count: 1 },
      ],
      worstFeature: { feature: "a", count: 5 },
    });
  });

  test("names at most the five most frequent causes", () => {
    const { friction } = insightsOf([
      featureUsage({
        friction: {
          ...NO_FRICTION,
          failedCommands: 6,
          browserErrors: 5,
          missingToolVersions: 4,
          denied: 3,
          staleEdits: 2,
          interruptions: 1,
        },
      }),
    ]);

    expect(friction.kinds.map((k) => k.kind)).toEqual([
      "failedCommands",
      "browserErrors",
      "missingToolVersions",
      "denied",
      "staleEdits",
    ]);
  });

  test("a period without friction names no kind and no feature", () => {
    expect(insightsOf([featureUsage()]).friction).toEqual({ kinds: [], worstFeature: undefined });
  });
});

describe("unusedSkills", () => {
  test("names the installed skills no session loaded, alphabetically", () => {
    expect(
      unusedSkills(
        ["tdd", "diagrams", "accessibility", "testing"],
        [
          { skill: "tdd", loads: 3, tokens: 4_000, rereadCostUsd: 1 },
          { skill: "diagrams", loads: 0, tokens: 0, rereadCostUsd: 0.2 },
          { skill: "testing", loads: 1, tokens: 3_000, rereadCostUsd: 0.5 },
        ],
      ),
    ).toEqual(["accessibility", "diagrams"]);
  });
});
