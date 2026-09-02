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

- `9445bcb` — keep the populated Compare upload action explicit about loading a comparison bundle
- `85e4f88` — keep mobile History in document flow so it cannot cover evidence rows
- `6f46872` — clarify that the contextual upload action replaces the active bundle
- `b9429cc` — remove the redundant Understand landing-page eyebrow after a rendered mobile/desktop audit
- `73c1690` — make Explore `calls:` and `reaches:` questions traverse the full bundled relationship chain
- `1abca96` — integrate mobile investigation navigation into the sticky shell
- `32ca7ca` — default plain Explore links to Modules while preserving filtered and focused topology deep links
- `d417266` — complete the mobile touch-target pass for search, toolbar, breadcrumb, and copy actions
- `74aefbe` — add bundle-grounded Explore questions for incoming and outgoing relationships
- `2831cc4` — raise mobile evidence controls to touch-safe sizes and improve persistent label readability
- `f476e37` — improve light-theme contrast for secondary metadata and filter labels
- `084c954` — add an explicit labeled main landmark to empty and populated Compare states
- `cffb253` — add a local, per-bundle pinned Trace-path working set
- `ab358ea` — standardize zoom and clear controls with the shared SVG icon system
- `f91b2e5` — align the Understand source-search hit area with the other lenses
- `13ec67f` — improve Trace path-name, metadata, and route-value reading hierarchy
- `650145f` — improve graph handoff, neighborhood, and filter action hit areas
- `a958678` — standardize Setup, status, Jump, and keyboard-help action icons
- `ea35d3d` — enlarge source-context action hit areas for mobile inspection
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
- `4484c45` — keep Trace’s three-step reading guide visible for first-time path reading
- `5d64b55` — collapse secondary Explore filters on mobile while preserving active filter visibility
- `7598a5f` — keep ordinary text searches compact while auto-expanding structured filters
- `6c9fda7` — raise Explore graph-area and boundary rows to the mobile touch-target minimum
- `0b87f31` — remove duplicated Map hero copy on mobile so the Explore workspace starts sooner
- `29c5599` — preserve two-line endpoint and file context for long Trace path labels on mobile
- `22e98a9` — clarify the hero’s line-count fact as Repository LOC rather than Source
- `9c85707` — return to bundle context after activation and wrap long evidence metrics at narrow widths
- `106d43c` — raise upload success/error notice actions to the mobile touch-target minimum
- `c962f4f` — raise populated Compare summaries, copy actions, expansion controls, and search clear to mobile touch targets
- `d5a6f9c` — raise Trace and investigation empty-state recovery actions to the mobile touch-target minimum
- `e3879cc` — raise Explore empty, reset, and neighborhood recovery controls to the mobile touch-target minimum
- `65b1c32` — keep dimmed focused-topology nodes and edges legible as surrounding context
- `9c1e790` — normalize loaded-bundle Understand notices and Explore context rows to mobile touch targets
- `64db4f9` — raise History drawer close, note, export, and clear actions to mobile touch targets
- `0ef924b` — normalize Command Palette and Shortcut Help controls at narrow widths
- `8c1970b` — add a compact lens-picker header for the previously overflowing tablet breakpoint
- `542921b` — extend the compact header through 920px to close the 901px breakpoint overflow gap
- Trace source inspector audit at 320px — zero visible controls below 44px and no horizontal overflow with the real `libxml2` bundle
- `96142ff` — hide inactive mobile history controls and make the compact lens menu keyboard-navigable
- `17df5cc` — extend tablet touch targets and remove misleading interactive minimap dots
- `07d4e68` — make invalid bundle recovery consistent and actionable on Understand
- `493bac1` — connect Explore filter and module disclosures to their controlled panels
- `b0971d2` — remove dangling ARIA references from conditionally mounted menus and inspectors
- `561d6cd` — prevent populated Compare sections from creating horizontal overflow on phones
- `0c39665` — remove the nested Compare `main` landmark and keep one accessible workspace landmark
- `24015a3` — preserve a named `main` landmark in empty Trace, Request Flow, and Boundary workspaces
- `c2b3918` — scope minimap SVG styling so zoom icons keep their intended size
- `231d825` — prevent Boundary action labels from shrinking and clipping inside the lens switch
- `b978dd1` — make invalid-bundle recovery consistent across non-home lenses

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

The Codex in-app browser runtime currently reports no available browsers (`[]`). Local Playwright is available and was used for bounded QA in this session: mobile lens navigation with the larger `libxml2` bundle, focused graph opening from Trace, filter guidance, post-upload status actions, bundle activation scroll restoration, History drawer actions, Command Palette and Shortcut Help dialogs, Active bundle menu, no horizontal overflow at 320px and 390px, and console/page-error checks. The latest narrow-screen pass also covered Trace’s real-bundle source inspector at 320px: all visible links, buttons, inputs, and summaries met the 44px target and the page stayed within the viewport. The compact lens picker was keyboard-tested at 390px: opening focuses the first menu item, ArrowDown advances lenses, and Escape restores focus to the trigger; inactive mobile history controls no longer add a blank header row. The compact-tablet matrix at 768px, 900px, and 920px now reports no sub-44px controls or horizontal overflow across all five lenses. With the real `libxml2` bundle at 390px, 26 topology nodes have 53px interaction bounds, the minimap is explicitly non-interactive, and selecting a node preserves the clean visual state. Invalid bundle recovery was also tested at 320px, 390px, and 768px: Understand now exposes “Try another bundle” and “Open bundle contract,” keeps the current bundle, and stays within the viewport. Explore’s filter and module disclosure semantics were checked at 390px: every `aria-expanded` control has a mounted `aria-controls` target before and after expansion, and collapsed module content uses native `hidden`. A cross-lens sweep also confirmed that conditionally mounted menu and inspector triggers no longer point to missing DOM targets; opening each menu adds its target and source-inspector focus restoration remains intact. A populated Compare pass with the real `libxml2` bundle reproduced a 601px page width at 390px; after `561d6cd`, Compare sections measure to the viewport at 320px, 390px, and 768px with no horizontal overflow. The Compare landmark pass now reports exactly one `main[aria-label="Revision comparison"]` in both empty and populated states, with no console or page errors. A real-bundle cross-lens sweep at 390px also confirms exactly one main landmark in Trace, Explore, Compare, Request Flow (including its legitimate empty state), and Boundary, with no horizontal overflow or browser errors. The minimap styling pass found zoom icons rendered at 80px on desktop because a broad descendant SVG selector overrode their 13px attributes; after `c2b3918`, desktop zoom controls are 28px/38px and mobile controls remain 44px, while the minimap stays 220px by 80px. A follow-up SVG icon sweep across all seven routes at 390px and 1440px found no declared-size deviations, no route overflow, and no console errors. Use the local Playwright Chromium executable for future visual checks until the in-app connector becomes available.

Settled light-theme validation with the real `libxml2` bundle at 390px and 1440px confirmed readable primary and secondary text, preserved semantic accent colors, no horizontal overflow, and no browser errors. The first phone screenshot was captured during the intentional theme transition; the settled render is the authoritative result.

The populated Compare workspace was also visually checked at 390px with the real `libxml2` bundle: active History appears only when navigation state exists, comparison actions meet the touch-target minimum, the success notice remains readable, and the dense diff sections stay within the viewport. A Boundary pass reproduced clipped “Copy link”, “Copy paths”, and “Open in Explore” labels at 390px; after `231d825`, the actions preserve their intrinsic widths (67px, 65px, and 85px), expose complete labels, and the page remains within the viewport at 390px and 1440px. Invalid bundle recovery was then tested from Trace and Compare at 390px: both shared notices expose “Try another bundle” and “Open bundle contract”, all three actions measure at least 44px high, the contract link points to the canonical docs, and the viewport remains 390px wide.

The latest Understand landing pass removed the redundant “CODE UNDERSTANDING WORKSPACE” eyebrow. At 390px and 1440px the heading now leads directly into the bundle-specific explanation, with no overflow and no detector findings. The invalid-upload pass also confirmed that the second `role="alert"` in the DOM is Next.js’s visually hidden route announcer, not a duplicate Explorer notice.

The comparison follow-up found the shared contextual upload action still labeled “Load bundle.json” after a bundle was active, while Compare correctly used “Load another.” After `6f46872`, non-home lenses consistently say “Load another bundle”; empty and populated Compare states remain unambiguous and overflow-free at 390px.

The next mobile pass reproduced the fixed History control covering Trace evidence rows at 390px. After `85e4f88`, History is a labeled, 44px control in normal document flow on narrow screens; a cross-lens sweep across Understand, Trace, Request Flow, Boundary, Explore, and Compare found no History/evidence overlap and no horizontal overflow.

The populated Compare pass also found the header action label “Load another” ambiguous beside the separate active-bundle upload action. After `9445bcb`, both empty and populated comparison states identify the target as “Load comparison bundle”; the 131.6px desktop/mobile control fits without overflow and remains 44px high on phones.

## Safe next session

Start a new Codex session in the same workspace and use this goal:

> Continue Lachesis Explorer UX work from `docs/UX_HANDOFF.md`. The goal is to help developers understand complex codebases faster than direct source reading. First check whether browser interaction is available, then run the app with `libxml2-bundle.json` and test Understand, Trace, Jump, source inspection, History, sharing, and mobile behavior. Do not add speculative features; fix only verified UX issues and commit each coherent change.

## Working rules

- Preserve the four unrelated/untracked user files: `AGENTS.md`, `CLAUDE.md`, `libxml2-bundle.json`, and `next-env.d.ts`.
- The current workspace also has user changes to `package.json` and `pnpm-lock.yaml` from installing Playwright; inspect before modifying or committing them.
- Use `apply_patch` for edits.
- Keep commits focused and descriptive.
- Do not claim visual QA without an actual browser run.
