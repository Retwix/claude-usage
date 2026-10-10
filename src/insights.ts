import {
  type FeatureUsage,
  FRICTION_KINDS,
  type Friction,
  median,
  type SkillUsage,
} from "./usage.ts";

export type CostlyFeature = {
  readonly feature: string;
  readonly costPerPrompt: number;
  readonly timesMedian: number;
  readonly promptsPerSession: number;
  readonly endContextTokens: number | undefined;
};

export type FrictionInsight = {
  readonly kinds: ReadonlyArray<{ readonly kind: keyof Friction; readonly count: number }>;
  readonly worstFeature: { readonly feature: string; readonly count: number } | undefined;
};

export type Insights = {
  readonly costliestPerPrompt: ReadonlyArray<CostlyFeature>;
  readonly friction: FrictionInsight;
};

const MIN_PROMPTS = 20;
const NOTABLE_TIMES_MEDIAN = 1.5;
const MAX_NAMED = 2;
const MAX_FRICTION_KINDS = 5;

const costliestPerPrompt = (
  features: ReadonlyArray<FeatureUsage>,
): ReadonlyArray<CostlyFeature> => {
  const candidates = features
    .filter((f) => f.prompts >= MIN_PROMPTS)
    .map((f) => ({ feature: f, costPerPrompt: f.costUsd / f.prompts }));
  const typical = median(candidates.map((c) => c.costPerPrompt)) ?? 0;
  return candidates
    .filter((c) => c.costPerPrompt >= typical * NOTABLE_TIMES_MEDIAN)
    .sort((a, b) => b.costPerPrompt - a.costPerPrompt)
    .slice(0, MAX_NAMED)
    .map(({ feature, costPerPrompt }) => ({
      feature: feature.feature,
      costPerPrompt,
      timesMedian: costPerPrompt / typical,
      promptsPerSession: feature.prompts / feature.sessions,
      endContextTokens: feature.endContextTokens,
    }));
};

export const frictionCount = (friction: Friction): number =>
  FRICTION_KINDS.reduce((total, kind) => total + friction[kind], 0);

const frictionInsight = (features: ReadonlyArray<FeatureUsage>): FrictionInsight => {
  const kinds = FRICTION_KINDS.map((kind) => ({
    kind,
    count: features.reduce((total, f) => total + f.friction[kind], 0),
  }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FRICTION_KINDS);
  const worst = features
    .map((f) => ({ feature: f.feature, count: frictionCount(f.friction) }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  return { kinds, worstFeature: worst };
};

export const insightsOf = (features: ReadonlyArray<FeatureUsage>): Insights => ({
  costliestPerPrompt: costliestPerPrompt(features),
  friction: frictionInsight(features),
});

export const unusedSkills = (
  installed: ReadonlyArray<string>,
  skills: ReadonlyArray<SkillUsage>,
): ReadonlyArray<string> => {
  const loaded = new Set(skills.filter((s) => s.loads > 0).map((s) => s.skill));
  return installed.filter((skill) => !loaded.has(skill)).sort();
};
