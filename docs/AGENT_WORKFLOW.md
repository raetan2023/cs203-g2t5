# Agent workflow: spend tokens on the task, not on re-reading the repo

Status: **proposal**, 2026-10-28. Nothing here is installed yet; section 5 lists what to approve.

## 1. Where tokens go today

From one session's work on the market page:

- **Re-deriving architecture.** Which component renders a route, which provider wraps which page, which files are
  dead. This took about 15 file reads, and one conclusion (a "shared" forecast horizon) was still wrong on the first pass.
- **Long append-only notes.** `docs/ui-revamp/UI_REVAMP_PLAN.md` mixes current state with superseded history, and
  `docs/PRD.md` is 300 lines. Agents read both whole to find a few lines.
- **Rebuilding throwaway harnesses.** A Vite + Playwright script to render one page without Clerk, and a proxy for
  the local backend, were rewritten from scratch because none is committed.
- **Large inputs read whole.** Skill references (taste's app-screen chapter is 84 KB) and the 172 screenshots under
  `docs/`.

## 2. The graph (graphify)

graphify is already installed (`graphify` on PATH, skill at `~/.claude/skills/graphify`).

**Measured on `frontend/src`:** `graphify update` builds a code graph in about 5 s with no LLM and 0 tokens
(296 nodes, 511 edges). `graphify explain` answers in about 100 tokens.

### Build (once per clone)

**Code graphs are free.** They are a deterministic syntax-tree (AST) parse, so build one per source area:

```bash
graphify update frontend/src        # → frontend/src/graphify-out/
graphify update backend/src
graphify update data-ingestion
```

**Docs graph: pay once, then cached per file.** graphify has no ignore file and would also extract the 172
screenshots (vision, the expensive part). So point it at a folder holding only the markdown:

```bash
mkdir -p .graphify-docs && cp docs/*.md docs/ui-revamp/*.md .graphify-docs/   # plus any other .md you want indexed
# then, in Claude Code:  /graphify .graphify-docs --wiki
```

`--wiki` writes an `index.md` plus one article per topic, which agents can read instead of the long source docs.

Optionally merge everything into one graph:
`graphify merge-graphs frontend/src/graphify-out/graph.json backend/src/graphify-out/graph.json --out graphify-out/graph.json`
(not yet tried here).

### Keep it fresh

| When | Command | Cost |
|---|---|---|
| Every commit | `graphify hook install` (once). The post-commit hook re-parses changed code files only. | free |
| Long or multi-agent sessions | `graphify watch frontend/src` in a background terminal | free |
| After a refactor that deletes code | `graphify update <path> --force` | free |
| Markdown changed (weekly, or after merging `main`) | re-copy the `.md` files, then `/graphify .graphify-docs --update` | only changed files |

The hook lives in the shared `.git/hooks`, so it covers worktrees too. Add `graphify-out/` and `.graphify-docs/` to
`.gitignore`: the graph is a local index, rebuilt per clone.

### Lookup order for an agent

1. **`CURRENT_STATE.md`** for the branch (section 3): what's done, what's next, and the open decisions.
2. **`graphify explain "<Symbol>"`** for file, line, imports and tests in about 100 tokens. For example,
   `explain "RecommendationApproval()"` returns `features/recommendations/RecommendationApproval.tsx L9`, imported by
   `RecommendationsPage.tsx`, tested by `RecommendationApproval.test.tsx`.
3. **`graphify path "A" "B"`** to trace a chain, for example `ClerkApp` to `ForecastProvider`.
4. **`graphify query "<question>" --budget 800`** only for broad "where does this area live" questions. It is
   keyword traversal, and it is noisy: "where does the buyer submit a plan for approval" started at the plan form's
   `submit()` and returned 43 nodes with the right file among them.
5. Then **Grep** for exact strings, and **Read with offset/limit** around the line numbers. Don't read a whole file
   over about 300 lines unless the task needs all of it.

### What the graph can't tell you

- **Runtime wiring.** JSX nesting and props aren't edges, so a page can be shown to import `ForecastProvider` while
  the graph can't say which provider instance wraps it. Behaviour questions still need the code.
- **Topic names.** Code-only builds number their clusters ("Community 0"); naming them takes the LLM step.
- **Uncommitted work.** The graph only reflects uncommitted changes while `watch` is running.

## 3. Other savings specific to this repo

1. **`CURRENT_STATE.md` per working branch**, 60 lines at most: done, next, decisions with owners, and links. Keep
   history in `UI_REVAMP_PLAN.md` but stop agents from needing it. Update it at the end of every session, like a
   handoff.
2. **Commit the render harness** as `frontend/scripts/render-page.mjs`, based on the existing
   `test-recommendation-layout.mjs` pattern. It would render any page with fixtures, without Clerk, proxy `/api` to
   the local backend, and screenshot at 1440/768/390. Every design review then starts from one command.
3. **Prefer checkers over reading.** `taste lint/inspect`, `impeccable detect`, `vitest` and `tsc` give verdicts and
   numbers for the cost of their output. Open screenshots only when judging visuals, after the numbers.
4. **Write a conclusion down once and link to it.** For example, `docs/ui-revamp/market-proposal/PARITY.md`
   (logic inventory) and `MISSING.md` (gaps). The next agent links to them instead of re-deriving.
5. **Delegate wide searches** (log trawls, "find every use of X") to a subagent at lower effort, and keep only its
   findings in the main context.
6. **Treat `docs/` screenshots as evidence, not reading.** Reference them by path, and open one only when comparing
   before and after.

## 4. Session checklist (paste into AGENTS.md once approved)

```
Before coding:  read CURRENT_STATE.md → graphify explain/path for the symbols involved → Grep → Read ranges.
While coding:   graphify watch <area> if several agents are editing; commit small (the hook refreshes the graph).
Before handoff: update CURRENT_STATE.md; record decisions in the doc that owns them; no new long notes.
```

## 5. To approve

1. Add `graphify-out/` and `.graphify-docs/` to `.gitignore`.
2. Run `graphify hook install` (post-commit, code only, free).
3. Build the docs graph once (`/graphify .graphify-docs --wiki`). This is the only step that costs tokens; later
   updates only re-extract changed files.
4. Create `CURRENT_STATE.md` for `feature/ui-revamp-wireframe` from the top of `UI_REVAMP_PLAN.md`.
5. Add section 4's checklist to `frontend/AGENTS.md`, or to a root `AGENTS.md` / `CLAUDE.md`.
   `graphify claude install` writes its own `CLAUDE.md` section; the repo has no root `CLAUDE.md` today, so that is a
   team choice.
6. Optional: commit the render harness (section 3, item 2).
