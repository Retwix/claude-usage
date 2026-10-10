import { frictionCount, insightsOf, unusedSkills } from "./insights.ts";
import {
  type AgentUsage,
  type FeatureUsage,
  FRICTION_KINDS,
  type Friction,
  type RepoUsage,
  type SkillUsage,
  type UsageSummary,
  type WeekdayUsage,
  type WeekUsage,
} from "./usage.ts";

export type ReportRange = {
  readonly id: string;
  readonly label: string;
  readonly summary: UsageSummary;
};

export type Report = {
  readonly ranges: ReadonlyArray<ReportRange>;
  readonly selectedRange: string;
  readonly weeks: ReadonlyArray<WeekUsage>;
  readonly installedSkills: ReadonlyArray<string>;
};

const SERIES_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];
const SERIES_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const KINDS_LIGHT = ["#0d366b", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef"];
const KINDS_DARK = ["#cde2fb", "#9ec5f4", "#6da7ec", "#2a78d6", "#184f95"];

const COST_KINDS = [
  { key: "cacheReadCostUsd", label: "Re-reading the conversation" },
  { key: "cacheWriteCostUsd", label: "Storing new context" },
  { key: "answerCostUsd", label: "Answers and code" },
  { key: "thinkingCostUsd", label: "Thinking" },
  { key: "inputCostUsd", label: "Uncached input" },
] as const satisfies ReadonlyArray<{ readonly key: keyof RepoUsage; readonly label: string }>;

const donutPaths = (values: ReadonlyArray<number>): ReadonlyArray<string> => {
  const total = values.reduce((a, b) => a + b, 0);
  const outer = 56;
  const inner = 36;
  const centre = 60;
  const point = (radius: number, turn: number): string => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${(centre + radius * Math.cos(angle)).toFixed(2)} ${(centre + radius * Math.sin(angle)).toFixed(2)}`;
  };
  let start = 0;
  return values.map((value) => {
    const share = total > 0 ? value / total : 0;
    const from = start;
    start += share;
    if (share <= 0) return "";
    const to = share >= 0.9999 ? from + 0.9999 : start;
    const large = to - from > 0.5 ? 1 : 0;
    return `M ${point(outer, from)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, to)} L ${point(inner, to)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, from)} Z`;
  });
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const formatCost = (usd: number): string =>
  usd >= 10 ? `$${Math.round(usd).toLocaleString("en-US")}` : `$${usd.toFixed(2)}`;

const formatDuration = (seconds: number): string =>
  seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : `${Math.round(seconds / 60)} min`;

const formatCount = (n: number): string => n.toLocaleString("en-US");

const formatShare = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

const formatTokens = (tokens: number | undefined): string => {
  if (tokens === undefined) return "—";
  return tokens < 1000 ? "<1k" : `${Math.round(tokens / 1000)}k`;
};

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const sum = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0);

const repoOrder = (repos: ReadonlyArray<RepoUsage>): ReadonlyArray<string> =>
  [...Map.groupBy(repos, (r) => r.repo)]
    .map(([repo, rows]) => ({ repo, cost: sum(rows.map((r) => r.costUsd)) }))
    .sort((a, b) => b.cost - a.cost)
    .map(({ repo }) => repo);

const repoVar = (repo: string, order: ReadonlyArray<string>): string => {
  const slot = order.indexOf(repo);
  return slot >= 0 && slot < SERIES_LIGHT.length ? `var(--series-${slot + 1})` : "var(--neutral)";
};

const seriesTokens = (palette: ReadonlyArray<string>): string =>
  palette.map((hex, i) => `--series-${i + 1}: ${hex};`).join(" ");

const kindTokens = (palette: ReadonlyArray<string>): string =>
  palette.map((hex, i) => `--kind-${i + 1}: ${hex};`).join(" ");

const inLegendOrder = (
  repos: ReadonlyArray<RepoUsage>,
  order: ReadonlyArray<string>,
): ReadonlyArray<RepoUsage> =>
  [...repos].sort((a, b) => order.indexOf(a.repo) - order.indexOf(b.repo));

const reposAttribute = (repos: ReadonlyArray<RepoUsage>): string =>
  escapeHtml(JSON.stringify(repos));

type SegmentOptions = {
  readonly className: string;
  readonly size: string;
  readonly order: ReadonlyArray<string>;
};

const segment = (repo: RepoUsage, { className, size, order }: SegmentOptions): string => {
  const tip = `${formatCost(repo.costUsd)}|${repo.repo} · ${formatDuration(repo.activeSeconds)}`;
  return `<span class="${className}" tabindex="0" data-repo="${escapeHtml(repo.repo)}" data-cost="${repo.costUsd}" data-tip="${escapeHtml(tip)}" style="${size};background:${repoVar(repo.repo, order)}"></span>`;
};

const repoBreakdown = (repos: ReadonlyArray<RepoUsage>, order: ReadonlyArray<string>): string =>
  repos
    .map(
      (r) =>
        `<span class="split" data-repo="${escapeHtml(r.repo)}"><i style="background:${repoVar(r.repo, order)}"></i>${escapeHtml(r.repo)} ${formatCost(r.costUsd)} · ${formatDuration(r.activeSeconds)}</span>`,
    )
    .join("");

const counted = (n: number, noun: string): string =>
  `${formatCount(n)} ${noun}${n === 1 ? "" : "s"}`;

const FRICTION_NOUNS: Readonly<Record<keyof Friction, string>> = {
  failedCommands: "failed command",
  browserErrors: "browser error",
  missingToolVersions: "missing tool version",
  safetyCheckUnavailable: "safety check down",
  guardrailBlocks: "guardrail block",
  autoModeBlocks: "auto mode block",
  zshTraps: "zsh trap",
  missingFiles: "missing file",
  serviceErrors: "service error",
  denied: "denied call",
  staleEdits: "stale edit",
  editMismatches: "edit mismatch",
  interruptions: "interrupt",
};

type FrictionWording = { readonly one: string; readonly many: string; readonly hint: string };

const FRICTION_WORDING: Readonly<Record<keyof Friction, FrictionWording>> = {
  failedCommands: {
    one: "other failed command",
    many: "other failed commands",
    hint: "commands that exited with an error for no reason listed here; read the transcript for the pattern",
  },
  browserErrors: {
    one: "browser automation error",
    many: "browser automation errors",
    hint: "usually the dev server was not running, or another session held the browser",
  },
  missingToolVersions: {
    one: "command with no tool version set",
    many: "commands with no tool version set",
    hint: "asdf has no version for that command in the folder it ran from; add it to .tool-versions",
  },
  safetyCheckUnavailable: {
    one: "call blocked because the safety check was down",
    many: "calls blocked because the safety check was down",
    hint: "auto mode could not reach its classifier; an outage, not your settings",
  },
  autoModeBlocks: {
    one: "call auto mode refused",
    many: "calls auto mode refused",
    hint: "the auto mode classifier judged the action risky; frequent hits on one action are worth an allow rule or a different approach",
  },
  zshTraps: {
    one: "command that hit a zsh-only trap",
    many: "commands that hit a zsh-only trap",
    hint: "a glob that matched nothing, a word starting with = (echo =====), unbalanced quotes, or a zsh reserved name like status",
  },
  guardrailBlocks: {
    one: "call stopped by a hook or guardrail",
    many: "calls stopped by a hook or guardrail",
    hint: "intended; frequent hits mean Claude keeps trying what the guard forbids",
  },
  missingFiles: {
    one: "read of a file that did not exist",
    many: "reads of files that did not exist",
    hint: "wrong paths, often the main checkout instead of the worktree",
  },
  serviceErrors: {
    one: "connector error",
    many: "connector errors",
    hint: "an MCP connector refused or failed; check its permissions",
  },
  denied: {
    one: "call you denied",
    many: "calls you denied",
    hint: "Claude asked for something you did not want",
  },
  staleEdits: {
    one: "edit refused because the file had changed",
    many: "edits refused because the file had changed",
    hint: "usually the formatter rewrote the file after the last read",
  },
  editMismatches: {
    one: "edit whose text did not match",
    many: "edits whose text did not match",
    hint: "Claude's copy of the file was out of date",
  },
  interruptions: {
    one: "interruption",
    many: "interruptions",
    hint: "times you stopped Claude mid-answer",
  },
};

const MAX_FRICTION_IN_ROW = 3;

const friction = ({ friction }: FeatureUsage): string => {
  const kinds = FRICTION_KINDS.filter((kind) => friction[kind] > 0)
    .sort((a, b) => friction[b] - friction[a])
    .slice(0, MAX_FRICTION_IN_ROW);
  return kinds.length === 0
    ? "—"
    : kinds.map((kind) => counted(friction[kind], FRICTION_NOUNS[kind])).join(" · ");
};

const row = (feature: FeatureUsage, maxCost: number, order: ReadonlyArray<string>): string => {
  const repos = inLegendOrder(feature.repos, order);
  const bar = repos
    .filter((r) => r.costUsd > 0)
    .map((r) =>
      segment(r, {
        className: "seg",
        size: `width:${((r.costUsd / maxCost) * 100).toFixed(3)}%`,
        order,
      }),
    )
    .join("");
  return `<tr data-feature="${escapeHtml(feature.feature)}" data-repos="${reposAttribute(feature.repos)}" data-sessions="${feature.sessions}" data-prompts="${feature.prompts}" data-friction="${frictionCount(feature.friction)}">
<td class="name" data-sort="${escapeHtml(feature.feature)}">${escapeHtml(feature.feature)}</td>
<td class="num strong cost" data-sort="${feature.costUsd}">${formatCost(feature.costUsd)}</td>
<td class="num active" data-sort="${feature.activeSeconds}">${formatDuration(feature.activeSeconds)}</td>
<td class="num waiting" data-sort="${feature.waitingSeconds / (feature.activeSeconds || 1)}">${formatShare(feature.waitingSeconds, feature.activeSeconds)}</td>
<td class="num large" data-sort="${feature.largeContextCostUsd / (feature.costUsd || 1)}">${formatShare(feature.largeContextCostUsd, feature.costUsd)}</td>
<td class="num" data-sort="${feature.endContextTokens ?? -1}">${formatTokens(feature.endContextTokens)}</td>
<td class="num" data-sort="${feature.prompts}">${formatCount(feature.prompts)}</td>
<td class="num" data-sort="${feature.sessions}">${formatCount(feature.sessions)}</td>
<td class="friction" data-sort="${frictionCount(feature.friction)}">${friction(feature)}</td>
<td class="bar" data-sort="${feature.costUsd}"><div class="track">${bar}</div><div class="splits">${repoBreakdown(repos, order)}</div></td>
<td class="span" data-sort="${feature.lastActive}">${formatDay(feature.firstActive)} – ${formatDay(feature.lastActive)}</td>
</tr>`;
};

const frictionCause = (kind: keyof Friction, count: number): string => {
  const { one, many, hint } = FRICTION_WORDING[kind];
  return `<li><strong>${formatCount(count)}</strong> ${count === 1 ? one : many}: ${hint}.</li>`;
};

const contextLines = (
  { features, sessionStartTokens, skills, agents }: UsageSummary,
  installedSkills: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const standing = sum(features.map((f) => f.standingCostPer10kUsd));
  const standingLine = `<li>Every 10k tokens of standing context (CLAUDE.md, memory, skill list) is re-read on every call: about <strong data-total="standing">${formatCost(standing)}</strong> in this period. Sessions start at ${formatTokens(sessionStartTokens)} tokens.</li>`;
  const [topSkill] = skills;
  const skillsLine = topSkill
    ? `<li>Re-reading loaded skills cost about ${formatCost(sum(skills.map((s) => s.rereadCostUsd)))}; <strong>${escapeHtml(topSkill.skill)}</strong> the most (${formatCost(topSkill.rereadCostUsd)} over ${counted(topSkill.loads, "load")}).</li>`
    : "";
  const unused = unusedSkills(installedSkills, skills);
  const unusedLine =
    unused.length > 0 ? `<li>Skills never loaded: ${unused.map(escapeHtml).join(", ")}.</li>` : "";
  const [topAgent] = agents;
  const agentsLine = topAgent
    ? `<li>Subagents cost ${formatCost(sum(agents.map((a) => a.costUsd)))} over ${counted(sum(agents.map((a) => a.runs)), "run")}; <strong>${escapeHtml(topAgent.agentType)}</strong> the most (${counted(topAgent.runs, "run")}, ${formatCost(topAgent.costUsd)}).</li>`
    : "";
  return [standingLine, skillsLine, unusedLine, agentsLine].filter((line) => line !== "");
};

const insightsPanel = (summary: UsageSummary, installedSkills: ReadonlyArray<string>): string => {
  const { features } = summary;
  const { costliestPerPrompt, friction } = insightsOf(features);
  const cost = sum(features.map((f) => f.costUsd));
  const savings = sum(features.map((f) => f.cyclingSavingsUsd));
  const savingsLine = `<li>Cycling at 200k tokens of context would have saved about <strong data-total="savings">${formatCost(savings)}</strong> (<span data-total="savings-share">${formatShare(savings, cost)}</span> of cost).</li>`;
  const costlyLines = costliestPerPrompt.map(
    (c) =>
      `<li data-feature="${escapeHtml(c.feature)}"><strong>${escapeHtml(c.feature)}</strong> costs ${formatCost(c.costPerPrompt)} a prompt, ${c.timesMedian.toFixed(1)}× the median: ${Math.round(c.promptsPerSession)} prompts per session, ending around ${formatTokens(c.endContextTokens)} tokens of context.</li>`,
  );
  const worst = friction.worstFeature
    ? ` Most in <strong>${escapeHtml(friction.worstFeature.feature)}</strong> (${formatCount(friction.worstFeature.count)}).`
    : "";
  const total = sum(features.map((f) => frictionCount(f.friction)));
  const frictionLine =
    friction.kinds.length > 0
      ? `<li>Real friction: ${formatCount(total)} events.${worst} Biggest causes:<ul>${friction.kinds.map((k) => frictionCause(k.kind, k.count)).join("")}</ul></li>`
      : "<li>No real friction in this period.</li>";
  const lines = [
    savingsLine,
    ...costlyLines,
    frictionLine,
    ...contextLines(summary, installedSkills),
  ];
  return `<div class="panel insights"><h2>What stands out</h2><ul>${lines.join("")}</ul></div>`;
};

const costDonut = (features: ReadonlyArray<FeatureUsage>): string => {
  const repos = features.flatMap((f) => f.repos);
  const values = COST_KINDS.map(({ key }) => sum(repos.map((r) => r[key])));
  const total = sum(values);
  const paths = donutPaths(values);
  const slices = COST_KINDS.map(
    ({ key }, i) =>
      `<path data-kind="${key}" d="${paths[i] ?? ""}" fill="var(--kind-${i + 1})"></path>`,
  ).join("");
  const legend = COST_KINDS.map(
    ({ key, label }, i) =>
      `<li data-kind="${key}"><i style="background:var(--kind-${i + 1})"></i><span>${label}</span> <strong class="kind-value">${formatCost(values[i] ?? 0)}</strong> · <span class="kind-share">${formatShare(values[i] ?? 0, total)}</span></li>`,
  ).join("");
  return `<div class="panel breakdown"><h2>Where the cost goes</h2><div class="donut-row">
<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Cost by kind">${slices}<text x="60" y="64" text-anchor="middle" class="donut-total">${formatCost(total)}</text></svg>
<ul class="donut-legend">${legend}</ul>
</div></div>`;
};

const tile = (total: string, label: string, value: string): string =>
  `<div class="tile"><div class="label">${label}</div><div class="value" data-total="${total}">${value}</div></div>`;

const skillsTable = (skills: ReadonlyArray<SkillUsage>): string =>
  `<table class="tools"><thead><tr><th scope="col">Skill</th><th scope="col" class="num">Loads</th><th scope="col" class="num">Size</th><th scope="col" class="num">Re-read cost</th></tr></thead><tbody>${skills
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.skill)}</td><td class="num">${formatCount(s.loads)}</td><td class="num">${formatTokens(s.tokens)}</td><td class="num">${formatCost(s.rereadCostUsd)}</td></tr>`,
    )
    .join("")}</tbody></table>`;

const agentsTable = (agents: ReadonlyArray<AgentUsage>): string =>
  `<table class="tools"><thead><tr><th scope="col">Agent</th><th scope="col" class="num">Runs</th><th scope="col" class="num">Cost</th></tr></thead><tbody>${agents
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.agentType)}</td><td class="num">${formatCount(a.runs)}</td><td class="num">${formatCost(a.costUsd)}</td></tr>`,
    )
    .join("")}</tbody></table>`;

type RangeOptions = {
  readonly selected: boolean;
  readonly order: ReadonlyArray<string>;
  readonly installedSkills: ReadonlyArray<string>;
};

const rangeSection = (
  { id, summary }: ReportRange,
  { selected, order, installedSkills }: RangeOptions,
): string => {
  const { features } = summary;
  const maxCost = Math.max(...features.map((f) => f.costUsd), Number.MIN_VALUE);
  const cost = sum(features.map((f) => f.costUsd));
  const active = sum(features.map((f) => f.activeSeconds));
  return `<section class="range" data-range="${escapeHtml(id)}"${selected ? "" : " hidden"}>
${insightsPanel(summary, installedSkills)}
<div class="kpis">
${tile("cost", "API-equivalent cost", formatCost(cost))}
${tile("active", "Active time", formatDuration(active))}
${tile("waiting", "Your turn", formatShare(sum(features.map((f) => f.waitingSeconds)), active))}
${tile("large", "Cost above 200k context", formatShare(sum(features.map((f) => f.largeContextCostUsd)), cost))}
${tile("prompts", "Prompts", formatCount(sum(features.map((f) => f.prompts))))}
${tile("sessions", "Sessions", formatCount(sum(features.map((f) => f.sessions))))}
${tile("friction", "Real friction", formatCount(sum(features.map((f) => frictionCount(f.friction)))))}
${tile("thinking", "Thinking", formatCost(sum(features.map((f) => f.thinkingCostUsd))))}
${tile("start", "Session start (tokens)", formatTokens(summary.sessionStartTokens))}
</div>
${costDonut(features)}
${weekdayChart(summary.weekdays)}
<div class="panel">
<table class="features">
<thead><tr>
<th scope="col">Feature</th><th scope="col" class="num" aria-sort="descending">Cost</th>
<th scope="col" class="num">Active</th><th scope="col" class="num">Your turn</th>
<th scope="col" class="num">Above 200k</th><th scope="col" class="num">End context</th>
<th scope="col" class="num">Prompts</th><th scope="col" class="num">Sessions</th>
<th scope="col">Friction</th><th scope="col">Cost by repo</th><th scope="col">Active between</th>
</tr></thead>
<tbody>${features.map((f) => row(f, maxCost, order)).join("")}</tbody>
</table>
</div>
<div class="tool-tables">
<div class="panel"><h2>Skills</h2>${skillsTable(summary.skills)}</div>
<div class="panel"><h2>Subagents</h2>${agentsTable(summary.agents)}</div>
</div>
</section>`;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayColumn = (day: WeekdayUsage, label: string): string =>
  `<div class="day" data-days="${escapeHtml(JSON.stringify(day.days))}">
<div class="day-cost"></div>
<div class="day-label">${label}</div>
<div class="day-active"></div>
</div>`;

const weekdayChart = (weekdays: ReadonlyArray<WeekdayUsage>): string =>
  `<div class="panel chart" aria-label="Cost and active time by day of the week">
<h2>By day of the week · average per day worked: cost above, active time below</h2>
<div class="days">${weekdays.map((d, i) => dayColumn(d, WEEKDAY_LABELS[i] ?? "")).join("")}</div>
</div>`;

const weekColumn = (week: WeekUsage, maxCost: number, order: ReadonlyArray<string>): string => {
  const cost = sum(week.repos.map((r) => r.costUsd));
  const segments = inLegendOrder(week.repos, order)
    .filter((r) => r.costUsd > 0)
    .map((r) =>
      segment(r, {
        className: "wseg",
        size: `height:${((r.costUsd / maxCost) * 100).toFixed(3)}%`,
        order,
      }),
    )
    .join("");
  return `<div class="week" data-week="${week.weekStart}" data-repos="${reposAttribute(week.repos)}">
<div class="week-total">${formatCost(cost)}</div>
<div class="week-plot">${segments}</div>
<div class="week-label">${formatDay(week.weekStart)}</div>
</div>`;
};

const weekComparison = (weeks: ReadonlyArray<WeekUsage>): string => {
  const [before, latest] = weeks
    .slice(-2)
    .map((w) => formatCost(sum(w.repos.map((r) => r.costUsd))));
  return latest === undefined
    ? `latest week ${before}`
    : `latest week ${latest} · week before ${before}`;
};

const weeklyChart = (weeks: ReadonlyArray<WeekUsage>, order: ReadonlyArray<string>): string => {
  if (weeks.length === 0) return "";
  const maxCost = Math.max(
    ...weeks.map((w) => sum(w.repos.map((r) => r.costUsd))),
    Number.MIN_VALUE,
  );
  return `<section class="panel chart" aria-label="Weekly cost by repo">
<h2>Weekly cost, all history · <span class="week-compare">${weekComparison(weeks)}</span></h2>
<div class="weeks">${weeks.map((w) => weekColumn(w, maxCost, order)).join("")}</div>
</section>`;
};

const legend = (order: ReadonlyArray<string>): string =>
  order
    .map(
      (repo) =>
        `<button type="button" class="key" aria-pressed="true" data-repo="${escapeHtml(repo)}"><i style="background:${repoVar(repo, order)}"></i>${escapeHtml(repo)}</button>`,
    )
    .join("");

const rangeButtons = (ranges: ReadonlyArray<ReportRange>, selected: string): string =>
  ranges
    .map(
      ({ id, label }) =>
        `<button type="button" data-range="${escapeHtml(id)}" aria-pressed="${id === selected}">${escapeHtml(label)}</button>`,
    )
    .join("");

const STYLE = `
:root { color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --border: rgba(11,11,11,0.10); --neutral: #b5b3ab; --warn: #8a5a00;
  ${seriesTokens(SERIES_LIGHT)} ${kindTokens(KINDS_LIGHT)} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --border: rgba(255,255,255,0.10); --neutral: #5f5e59; --warn: #e0a940;
  ${seriesTokens(SERIES_DARK)} ${kindTokens(KINDS_DARK)} } }
:root[data-theme="dark"] { color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --border: rgba(255,255,255,0.10); --neutral: #5f5e59; --warn: #e0a940;
  ${seriesTokens(SERIES_DARK)} ${kindTokens(KINDS_DARK)} }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 13px; font-weight: 500; color: var(--ink-2); margin: 0 0 12px; }
.sub { color: var(--ink-2); margin: 0 0 20px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; margin-bottom: 16px; }
.ranges { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.ranges button { font: inherit; font-size: 13px; color: var(--ink-2); background: none; border: 0; padding: 6px 14px; cursor: pointer; }
.ranges button + button { border-left: 1px solid var(--border); }
.ranges button[aria-pressed="true"] { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--ink-2); font-size: 12px; }
.legend::before { content: "Repos (click to hide):"; color: var(--muted); padding: 2px 0; }
.key { font: inherit; color: inherit; background: none; border: 0; padding: 2px 0; cursor: pointer; }
.key[aria-pressed="false"] { text-decoration: line-through; opacity: 0.5; }
.key[aria-pressed="false"] i { background: transparent !important; outline: 1px solid var(--muted); outline-offset: -1px; }
.key i, .split i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 12px; margin-bottom: 20px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .label { color: var(--ink-2); font-size: 12px; }
.tile .value { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.warn { color: var(--warn); margin: 0 0 16px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow-x: auto; }
.chart { padding: 16px; margin-bottom: 20px; }
.insights { padding: 14px 18px; margin-bottom: 16px; }
.insights h2 { margin-bottom: 6px; }
.insights ul { margin: 0; padding-left: 18px; }
.insights li { margin: 4px 0; }
.breakdown { padding: 14px 18px; margin-bottom: 20px; }
.donut-row { display: flex; align-items: center; gap: 28px; }
.donut { width: 150px; height: 150px; flex: none; }
.donut path { stroke: var(--surface); stroke-width: 2; }
.donut-total { font-size: 15px; font-weight: 600; fill: var(--ink); }
.donut-legend { list-style: none; margin: 0; padding: 0; color: var(--ink-2); }
.donut-legend li { margin: 5px 0; font-variant-numeric: tabular-nums; }
.donut-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: -1px; }
.donut-legend strong { color: var(--ink); }
.tool-tables { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; margin-top: 16px; align-items: start; }
.tool-tables .panel { padding: 14px 16px; }
table.tools { min-width: 0; }
table.tools th { cursor: default; }
.insights li ul { margin: 4px 0 6px; color: var(--ink-2); }
.weeks, .days { display: flex; align-items: flex-end; gap: 6px; }
.week, .day { flex: 1; min-width: 28px; display: flex; flex-direction: column; align-items: stretch; }
.week-total, .day-cost, .day-active { text-align: center; font-size: 11px; color: var(--ink-2); font-variant-numeric: tabular-nums; margin-bottom: 4px; white-space: nowrap; }
.week-plot { height: 140px; display: flex; flex-direction: column-reverse; gap: 2px; border-bottom: 1px solid var(--grid); }
.wseg { display: block; min-height: 2px; }
.wseg:last-child { border-radius: 4px 4px 0 0; }
.wseg:hover, .wseg:focus { filter: brightness(1.15); outline: none; }
.week-label, .day-label { text-align: center; font-size: 11px; color: var(--muted); margin-top: 4px; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; min-width: 1240px; }
th { text-align: left; font-weight: 500; font-size: 12px; color: var(--ink-2); padding: 10px 12px;
  border-bottom: 1px solid var(--grid); cursor: pointer; user-select: none; white-space: nowrap; }
th.num { text-align: right; }
th[aria-sort="descending"]::after { content: " ↓"; }
th[aria-sort="ascending"]::after { content: " ↑"; }
td { padding: 10px 12px; border-bottom: 1px solid var(--grid); vertical-align: top; }
tbody tr:hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.strong { font-weight: 600; }
td.name { font-weight: 500; }
td.friction { color: var(--ink-2); font-size: 12px; white-space: nowrap; }
td.bar { width: 30%; min-width: 240px; }
td.span { color: var(--ink-2); white-space: nowrap; }
.track { display: flex; gap: 2px; height: 12px; }
.seg { display: block; height: 100%; min-width: 2px; }
.seg:first-child { border-radius: 4px 0 0 4px; }
.seg:last-child { border-radius: 0 4px 4px 0; }
.seg:only-child { border-radius: 4px; }
.seg:hover, .seg:focus { filter: brightness(1.15); outline: none; }
.splits { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 6px; color: var(--ink-2); font-size: 12px; }
.split i { width: 8px; height: 8px; margin-right: 4px; }
.foot { color: var(--muted); font-size: 12px; margin-top: 16px; }
#tip { position: fixed; pointer-events: none; background: var(--surface); color: var(--ink-2);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12); display: none; }
#tip strong { display: block; color: var(--ink); font-size: 14px; }
`;

const SCRIPT = `
const donutPaths = ${donutPaths};
const COST_KIND_KEYS = ${JSON.stringify(COST_KINDS.map(({ key }) => key))};
const formatCost = ${formatCost};
const formatDuration = ${formatDuration};
const formatCount = ${formatCount};
const formatShare = ${formatShare};

const tip = document.getElementById("tip");
const show = (el, x, y) => {
  const [value, label] = el.dataset.tip.split("|");
  tip.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = value;
  tip.append(strong, document.createTextNode(label));
  tip.style.display = "block";
  tip.style.left = Math.min(x + 12, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = (y + 14) + "px";
};
document.querySelectorAll(".seg, .wseg").forEach((el) => {
  el.addEventListener("pointermove", (e) => show(el, e.clientX, e.clientY));
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); show(el, r.left, r.bottom); });
  ["pointerleave", "blur"].forEach((t) => el.addEventListener(t, () => { tip.style.display = "none"; }));
});

const sorters = [...document.querySelectorAll("section.range table.features")].map((table) => {
  const tbody = table.tBodies[0];
  const headers = [...table.querySelectorAll("th")];
  let sorting = { col: headers.findIndex((th) => th.hasAttribute("aria-sort")), desc: true };
  const sortRows = () => {
    const { col, desc } = sorting;
    headers.forEach((h, i) => (i === col ? h.setAttribute("aria-sort", desc ? "descending" : "ascending") : h.removeAttribute("aria-sort")));
    const key = (tr) => tr.children[col].dataset.sort;
    const rows = [...tbody.rows].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      const cmp = isNaN(x) || isNaN(y) ? x.localeCompare(y) : x - y;
      return desc ? -cmp : cmp;
    });
    tbody.append(...rows);
  };
  headers.forEach((th, col) => th.addEventListener("click", () => {
    sorting = { col, desc: !(sorting.col === col && sorting.desc) };
    sortRows();
  }));
  return sortRows;
});

const store = {
  read: (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const HIDDEN_KEY = "claude-usage:hidden-repos";
const RANGE_KEY = "claude-usage:range";
const hidden = new Set(store.read(HIDDEN_KEY, []));
const sum = (values) => values.reduce((a, b) => a + b, 0);
const visibleRepos = (el) => JSON.parse(el.dataset.repos).filter((r) => !hidden.has(r.repo));
const setCell = (td, sortValue, text) => { td.dataset.sort = sortValue; td.textContent = text; };

const applyToDays = (section) => section.querySelectorAll(".day").forEach((day) => {
  const worked = JSON.parse(day.dataset.days)
    .map((d) => d.repos.filter((r) => !hidden.has(r.repo)))
    .filter((repos) => repos.length > 0);
  const average = (key) => sum(worked.flat().map((r) => r[key])) / Math.max(worked.length, 1);
  day.querySelector(".day-cost").textContent = formatCost(average("costUsd"));
  day.querySelector(".day-active").textContent = formatDuration(average("activeSeconds"));
});

const applyToRange = (section) => {
  const shown = [...section.querySelectorAll("table.features tbody tr")].flatMap((tr) => {
    const all = JSON.parse(tr.dataset.repos);
    const repos = visibleRepos(tr);
    tr.hidden = all.length > 0 && repos.length === 0;
    tr.querySelectorAll("[data-repo]").forEach((el) => { el.hidden = hidden.has(el.dataset.repo); });
    const t = {
      cost: sum(repos.map((r) => r.costUsd)),
      seconds: sum(repos.map((r) => r.activeSeconds)),
      waiting: sum(repos.map((r) => r.waitingSeconds)),
      large: sum(repos.map((r) => r.largeContextCostUsd)),
      savings: sum(repos.map((r) => r.cyclingSavingsUsd)),
      standing: sum(repos.map((r) => r.standingCostPer10kUsd)),
      thinking: sum(repos.map((r) => r.thinkingCostUsd)),
      kinds: COST_KIND_KEYS.map((key) => sum(repos.map((r) => r[key]))),
    };
    setCell(tr.querySelector("td.cost"), t.cost, formatCost(t.cost));
    setCell(tr.querySelector("td.active"), t.seconds, formatDuration(t.seconds));
    setCell(tr.querySelector("td.waiting"), t.waiting / (t.seconds || 1), formatShare(t.waiting, t.seconds));
    setCell(tr.querySelector("td.large"), t.large / (t.cost || 1), formatShare(t.large, t.cost));
    tr.querySelector("td.bar").dataset.sort = t.cost;
    return tr.hidden ? [] : [{ tr, ...t }];
  });
  const maxCost = Math.max(...shown.map((r) => r.cost), Number.MIN_VALUE);
  shown.forEach(({ tr }) => tr.querySelectorAll(".seg").forEach((seg) => {
    seg.style.width = (Number(seg.dataset.cost) / maxCost) * 100 + "%";
  }));
  const total = (name, text) => { section.querySelector('[data-total="' + name + '"]').textContent = text; };
  const cost = sum(shown.map((r) => r.cost));
  const seconds = sum(shown.map((r) => r.seconds));
  const count = (attr) => sum(shown.map((r) => Number(r.tr.dataset[attr])));
  total("cost", formatCost(cost));
  total("active", formatDuration(seconds));
  total("waiting", formatShare(sum(shown.map((r) => r.waiting)), seconds));
  total("large", formatShare(sum(shown.map((r) => r.large)), cost));
  total("prompts", formatCount(count("prompts")));
  total("sessions", formatCount(count("sessions")));
  total("friction", formatCount(count("friction")));
  const savings = sum(shown.map((r) => r.savings));
  total("savings", formatCost(savings));
  total("savings-share", formatShare(savings, cost));
  total("standing", formatCost(sum(shown.map((r) => r.standing))));
  total("thinking", formatCost(sum(shown.map((r) => r.thinking))));
  const kindTotals = COST_KIND_KEYS.map((_, i) => sum(shown.map((r) => r.kinds[i])));
  const kindSum = sum(kindTotals);
  const paths = donutPaths(kindTotals);
  section.querySelectorAll(".donut path").forEach((path, i) => path.setAttribute("d", paths[i]));
  section.querySelectorAll(".donut-legend li").forEach((li, i) => {
    li.querySelector(".kind-value").textContent = formatCost(kindTotals[i]);
    li.querySelector(".kind-share").textContent = formatShare(kindTotals[i], kindSum);
  });
  section.querySelector(".donut-total").textContent = formatCost(kindSum);
  applyToDays(section);
  const shownFeatures = new Set(shown.map((r) => r.tr.dataset.feature));
  section.querySelectorAll(".insights li[data-feature]").forEach((li) => { li.hidden = !shownFeatures.has(li.dataset.feature); });
};

const applyToWeeks = () => {
  const weeks = [...document.querySelectorAll(".week")].map((week) => ({
    week,
    cost: sum(visibleRepos(week).map((r) => r.costUsd)),
  }));
  const maxCost = Math.max(...weeks.map((w) => w.cost), Number.MIN_VALUE);
  const [before, latest] = weeks.slice(-2).map((w) => formatCost(w.cost));
  const compare = document.querySelector(".week-compare");
  if (compare) compare.textContent = latest === undefined ? "latest week " + before : "latest week " + latest + " · week before " + before;
  weeks.forEach(({ week, cost }) => {
    week.querySelector(".week-total").textContent = formatCost(cost);
    week.querySelectorAll(".wseg").forEach((seg) => {
      seg.hidden = hidden.has(seg.dataset.repo);
      seg.style.height = (Number(seg.dataset.cost) / maxCost) * 100 + "%";
    });
  });
};

const applyHidden = () => {
  document.querySelectorAll(".legend [data-repo]").forEach((b) => b.setAttribute("aria-pressed", String(!hidden.has(b.dataset.repo))));
  document.querySelectorAll("section.range").forEach(applyToRange);
  applyToWeeks();
  sorters.forEach((sortRows) => sortRows());
};

document.querySelectorAll(".legend [data-repo]").forEach((button) => button.addEventListener("click", () => {
  const repo = button.dataset.repo;
  if (hidden.has(repo)) hidden.delete(repo); else hidden.add(repo);
  store.write(HIDDEN_KEY, [...hidden]);
  applyHidden();
}));

const chooseRange = (id) => {
  document.querySelectorAll("section.range").forEach((s) => { s.hidden = s.dataset.range !== id; });
  document.querySelectorAll(".ranges [data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === id)));
};
document.querySelectorAll(".ranges [data-range]").forEach((button) => button.addEventListener("click", () => {
  chooseRange(button.dataset.range);
  store.write(RANGE_KEY, button.dataset.range);
}));
const savedRange = store.read(RANGE_KEY, null);
if (document.querySelector('section.range[data-range="' + savedRange + '"]')) chooseRange(savedRange);

applyHidden();
`;

export const renderReport = (
  { ranges, selectedRange, weeks, installedSkills }: Report,
  { generatedAt }: { readonly generatedAt: Date },
): string => {
  const features = ranges.flatMap((r) => r.summary.features);
  const order = repoOrder([...features.flatMap((f) => f.repos), ...weeks.flatMap((w) => w.repos)]);
  const unpriced = [...new Set(ranges.flatMap((r) => r.summary.unpricedModels))];
  const firsts = features.map((f) => f.firstActive).sort();
  const lasts = features.map((f) => f.lastActive).sort();
  const period =
    firsts.length > 0
      ? `${formatDay(firsts[0] ?? "")} – ${formatDay(lasts.at(-1) ?? "")}`
      : "no activity";
  const warning =
    unpriced.length > 0
      ? `<p class="warn">⚠ Not priced, so missing from cost: ${unpriced.map(escapeHtml).join(", ")}</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Usage</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Claude usage by feature</h1>
<p class="sub">Data from ${period} · generated ${generatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
${warning}
<div class="controls">
<div class="ranges" role="group" aria-label="Date range">${rangeButtons(ranges, selectedRange)}</div>
<div class="legend" aria-label="Repos: click to hide or show">${legend(order)}</div>
</div>
${weeklyChart(weeks, order)}
${ranges.map((r) => rangeSection(r, { selected: r.id === selectedRange, order, installedSkills })).join("\n")}
<p class="foot">Cost is what these tokens would cost at Anthropic API prices; on a Max subscription it is a measure of use, not a bill.
Active time adds up the gaps between transcript records, counting at most 5 minutes of any idle gap; your turn is the part of it spent before a prompt you typed.
Above 200k is the share of cost spent on calls whose context (everything the model re-read) was over 200k tokens; end context is the average context of each session's last call.
Real friction counts calls you denied, edits refused because the file had changed or the text didn't match, failed commands (subagents included) and interruptions; searches that found nothing, test runs and <code>claude-dev cycle</code> ending its own session are not friction.
The cycling estimate assumes a session cycled at 200k averages 130k tokens of context and pays a 60k-token cache write per cycle; sessions where that costs more than it saves count as zero.
Thinking is the part of output spent reasoning; it is billed as output and already inside the cost.
Standing context is what every call re-reads before your conversation: system prompt, tools, CLAUDE.md, memory and the skill list; session start is the median size of a session's first call.
A skill's re-read cost is what its loaded text cost in every later call of that session (size estimated at 4 characters per token); subagent cost is what the subagent's own calls cost.
A feature is the worktree a session's <code>claude-dev cycle</code> prompt names, else the worktree it worked in most; sessions that touched none are grouped under the folder they ran in, in brackets.</p>
</main>
<div id="tip" role="tooltip"></div>
<script>${SCRIPT}</script>
</body>
</html>
`;
};
