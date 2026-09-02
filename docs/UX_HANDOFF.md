# Lachesis Explorer UX handoff

## Goal

Make Lachesis Explorer the fastest way for a developer to understand an unfamiliar, complex codebase. The explorer should be more useful than reading source files directly by keeping a guided path, graph relationships, exact source context, and shareable explanation together.

Lachesis remains security-oriented at the product level. Explorer is the code-understanding layer over the graph it produces; it is not meant to become a second security dashboard.

## UX direction

- Start with a developer question, not a graph dump.
- Guide the user through one behavior, request flow, or boundary at a time.
- Keep source, file/line location, relationship, and path position visible together.
- Make graph uncertainty, missing source, and projection limits explicit.
- Let users move between path, node, file, module, and connected context without losing their place.
- Make explanations portable through Markdown and deep links.
- Prefer simple, readable flows over adding advanced graph features without a comprehension benefit.

## Current experience

- **Understand:** first-run orientation, recommended starting path, question-based entry points, bundle coverage, source search, and partial-bundle empty states.
- **Trace:** step-by-step graph paths with Previous/Next controls, direction switching, path canvas, source inspector, relationship captions, and path limitations.
- **Request flow:** starting-point-to-effect reading flow with the same source context and navigation model.
- **Explore:** topology, minimap, focused neighborhoods, module grouping, data-quality view, semantic search, and graph limits for dense bundles.
- **What reaches here:** convergence/boundary view, evidence matrix, overlap context, and source-aware path filtering.
- **Compare:** revision/path comparison with source coverage and portable path sequences.
- **Jump:** keyboard-first search across views, paths, entries, nodes, files, modules, documentation, and source text.
- **Source inspector:** source window/snippet, line and column, copy location, copy source/context, nearby symbols, parent/child context, connected paths, repository links, and honest missing-source states.
- **History:** local investigation trail, notes, replay, and Markdown export with bundle context and limitations.

## Bundle and sharing expectations

The UI supports the graph bundle contract in `docs/GRAPH_EXPLORER_CONTRACT.md` and the schema in `docs/GRAPH_EXPLORER_BUNDLE.schema.json`.

Important behavior:

- A bundle can be a focused projection of a much larger indexed repository.
- The UI must distinguish included nodes from indexed nodes.
- Source is optional; missing source must not be presented as a broken repository link.
- Relationship origins and uncertainty must remain visible.
- Local deep links require the recipient to load the same local bundle.
- Markdown exports include the selected context and known limitations so shared explanations do not overstate certainty.

## Recent UX work

The latest commits are small, focused slices. The most recent changes:

- `5992b82` — raise compact search-clear and keyboard-help targets to a usable minimum
- `0f5f952` — use the shared SVG icon system for history controls
- `5721cb4` — improve mobile navigation placement and increase legibility of secondary labels
- `a028be0` — expose bounded Back/Forward controls as a compact mobile pill
- `1ed3bfe` — add bounded Back/Forward controls for URL-backed investigation states
- `d20f191` — advertise structured filters in the Jump search affordance
- `a4dfa69` — make Jump understand the same file/module/path filters as Explore
- `070589f` — show `<1%` instead of misleading `0%` for tiny projections
- `86d55e5` — give hidden graph and comparison upload inputs accessible names
- `a52d1f2` — preserve security sample identity across URL rewrites and reloads
- `0b3901b` — prevent initial Trace/convergence canvases from scrolling into inspectors
- `ce9ab61` — make empty Trace/Journey context states honest instead of showing stale step counts
- `e072e07` — keep Trace navigation anchored to the heading instead of the deep inspector
- `29ba52c` — remove duplicate load-status messaging that obscured mobile intros
- `97d0d31` — preserve the requested view during initial deep-link restoration
- `9ba705c` — clarify the request-flow question and expose graph filter syntax
- `e9525c2` — add file/line context to connected-symbol concentration rows
- `451a316` — preserve focused graph neighborhoods when opening Explore from Trace
- `661a735` — make Explore open the module lens by default while preserving focused topology entry
- `44e3771` — lead duplicate path labels with endpoint symbols and raise path-list metadata size
- `ed58008` — replace overlapping mobile lens tabs with an explicit current-lens picker

- `b08c3f6` — clarify paths across analysis lenses
- `5f6a67c` — clarify connected path context
- `39d08a3` — preserve request identity in Journey
- `40391a8` — disambiguate request-flow entries
- `482f005` — replay exact request flows from history
- `8b7fa23` — replay exact paths from history
- `d0d90f3` — preserve path identity after navigation
- `69f260b` — align the recommended path label
- `8d05845` — summarize loaded bundle scope
- `9cda095` — reduce repeated path metadata
- `cc7f76a` / `693ef1f` — disambiguate Jump and Trace path results

Also completed earlier in the project: README/OSS setup, resource links, privacy-preserving analytics/events, v2 bundle metadata and source URL templates, source-aware search, responsive/accessibility work, graph progressive disclosure, Markdown/deep-link sharing, and contract validation.

## Validation status

The following checks pass on the current branch:

```bash
corepack pnpm run check
git diff --check
node /Users/riyandhiman/.codex/skills/impeccable/scripts/detect.mjs --json app components lib
```

`pnpm run check` includes TypeScript, bundle verification, and production build. The UX detector currently reports no findings.

## Real bundle used for review

`libxml2-bundle.json` is an available local legacy/flow projection for manual testing. It contains approximately 26 included graph nodes, 16 paths, 10 relationships, and reports about 193,057 indexed nodes. It is intentionally untracked and should not be staged unless explicitly requested.

## Browser validation

The app starts successfully with:

```bash
corepack pnpm dev
```

The Codex in-app browser runtime currently reports no available browsers (`[]`). Local Playwright is available and was used for bounded QA in this session: mobile lens navigation, focused graph opening from Trace, filter guidance, no horizontal overflow at 390px, and console/page-error checks. Use the local Playwright Chromium executable for future visual checks until the in-app connector becomes available.

## Safe next session

Start a new Codex session in the same workspace and use this goal:

> Continue Lachesis Explorer UX work from `docs/UX_HANDOFF.md`. The goal is to help developers understand complex codebases faster than direct source reading. First check whether browser interaction is available, then run the app with `libxml2-bundle.json` and test Understand, Trace, Jump, source inspection, History, sharing, and mobile behavior. Do not add speculative features; fix only verified UX issues and commit each coherent change.

## Working rules

- Preserve the four unrelated/untracked user files: `AGENTS.md`, `CLAUDE.md`, `libxml2-bundle.json`, and `next-env.d.ts`.
- The current workspace also has user changes to `package.json` and `pnpm-lock.yaml` from installing Playwright; inspect before modifying or committing them.
- Use `apply_patch` for edits.
- Keep commits focused and descriptive.
- Do not claim visual QA without an actual browser run.
