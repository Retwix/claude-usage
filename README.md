# claude-usage

A local dashboard of Claude Code usage per feature: sessions, prompts, active time and API-equivalent cost, split by repo.

## Getting started

You need Node 25 (it runs the TypeScript sources directly; `.tool-versions` pins the exact version for asdf) and Yarn 1.

```sh
git clone https://github.com/pablocm90/claude-usage.git
cd claude-usage
yarn install
yarn usage        # open the printed file:// URL in a browser
```

It reads the Claude Code transcripts on your own machine (`~/.claude/projects`), so each person sees their own usage.

## Commands

```sh
yarn usage        # reads ~/.claude/projects, writes usage.html, prints its file:// URL
yarn verify       # typecheck, lint, tests
yarn stryker run  # mutation testing (render.ts is presentation and left out)
```

Nothing leaves the machine: it reads the transcripts and writes one static HTML file.

## How the numbers are made

- **Feature**: the task a session's `claude-dev cycle` prompt names (`Fresh session for task '<slug>'`), else the worktree (`<repo>/.claude/worktrees/<slug>`) that the session's `cwd` and tool calls touched most. A session that touched no worktree is grouped under its folder, in brackets. You don't need `claude-dev` or worktrees: without them, sessions are grouped by folder.
- **Repo split**: each moment goes to the repo of the last worktree path seen for that feature; before any, to the folder the session ran in. Backend and frontend worktrees with the same slug are one feature.
- **Active time**: the gaps between transcript records, subagents included, with idle gaps capped at 5 minutes.
- **Prompts**: user records whose `origin.kind` is `human`.
- **Cost**: token counts × per-model API prices in `src/pricing.ts`. Each response is counted once (transcripts repeat it per content block). A model missing from the table is named in a warning instead of being priced at zero without notice. Add new models there.
- **Your turn**: the part of active time spent in the gap before a prompt you typed (same 5-minute cap).
- **Above 200k**: the share of cost spent on calls whose context (everything the model re-read: input, cache reads, cache writes) was over 200k tokens. **End context** averages each session's last main call.
- **Real friction**: tool calls that went wrong, grouped by cause: calls you denied, calls auto mode refused, calls a hook or guardrail stopped, calls blocked because auto mode's safety check was down, zsh-only traps (`(eval):N:` errors such as an unmatched glob or `echo =====`), commands with no asdf tool version, browser automation errors, reads of missing files, connector (MCP) errors, edits refused because the file changed or the text did not match, other failed commands, and interruptions. Not friction: a search that found nothing (`grep`, `find`, `ls`, `diff`, `test`, `pkill`), a test or gate run (often an intended RED), and `claude-dev cycle` ending its own session. The panel lists the five biggest causes with a hint; the table shows each feature's top three.
- **What stands out** (one panel per range, rebuilt on every run): the estimated saving from cycling at 200k (assumes a cycled session averages 130k tokens of context and pays a 60k-token cache write per 140k grown past 200k, priced per model; a session where that costs more than it saves counts as zero), up to two features costing at least 1.5× the median per prompt (among features with 20+ prompts) with their prompts per session and end context, and real friction by kind.
- **Thinking**: the thinking part of output tokens, priced as the output it is billed as; it is already inside the cost.
- **Standing context**: what 10k more tokens re-read on every call (system prompt, tools, CLAUDE.md, memory, skill list) would cost in the range; **session start** is the median context of a session's first call.
- **Skills**: loads per skill, estimated size (4 characters per token), and what re-reading the loaded text cost in every later call of the session; installed skills (`~/.claude/skills`) no session loaded in the range are listed.
- **Subagents**: runs and cost per agent type, read from each subagent's `.meta.json`.
- **Where the cost goes**: a donut per range splitting cost into re-reading the conversation (cache reads), storing new context (cache writes), answers and code (output without thinking), thinking, and uncached input.
- **Ranges**: "Last 7 days" and "Last 30 days" count only what happened inside the window; the weekly chart always covers all history. Clicking a repo in the legend hides it from the chart, the tables and the totals, and the page remembers the choice and the range.

Transcripts are kept for `cleanupPeriodDays` (set to 365 in `~/.claude/settings.json`), so that is how far back the dashboard can see.
