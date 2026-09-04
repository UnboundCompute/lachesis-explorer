# Lachesis Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Live demo](https://img.shields.io/badge/demo-lachesis.unboundcompute.com-brightgreen.svg)](https://lachesis.unboundcompute.com)

The browser companion for [Lachesis](https://github.com/UnboundCompute/lachesis), a compiler-precise code property graph for following values, calls, and source-to-sink paths through a codebase.

Explorer loads a Lachesis `bundle.json` locally and makes the graph readable without a server or model in the loop. It is designed for inspecting deterministic evidence: where a value originated, which nodes it reaches, and how a request travels through an application.

## What it does

- Trace a value backward to its origin or forward to its sink.
- Start from a sink and reveal every bundled value flow converging on it.
- Focus a convergence field on paths containing the selected node, then restore the full field.
- Compare reaching flows in an evidence matrix with alias, dynamic-edge, and MCP provenance.
- Show node source, file locations, aliases, dynamic edges, and MCP evidence.
- Walk a request callpath hop by hop with baked graph layout when available.
- Filter flows and graph nodes with semantic terms such as `edge:dynamic`, `edge:uncertain`, `edge:explicit`, `edge:derived`, `origin:value-flow`, `origin:request-path`, `confidence:medium`, `kind:sink`, `file:db/`, and `has:mcp`.
- Capture a local investigation trail and export it as Markdown.
- Load any compatible `bundle.json` from the browser.
- Switch between light and dark themes; the preference is saved locally.
- Jump to views, values, or entrypoints with `Cmd/Ctrl+K`; deep links preserve the active graph selection.
- Copy a local link to the selected graph node, value-flow step, or request-path hop; path links preserve the exact step position, including repeated symbols.
- Move between lenses with browser Back/Forward; the URL restores the active lens, sink, path position, direction, and occurrence identity when the bundle is available.
- Graph links also preserve the selected Graph lens—Topology, Architecture, or Health—and an active focused neighborhood, so a shared system-level view opens in the same reading mode.
- Copy a selected symbol’s `file:line:column` location from the source inspector.
- Open a selected symbol in its source repository when the bundle provides `meta.source_url_template`.
- Copy readable graph-path, request-path, or converging-path sequences with relationships, source locations, and scope context.
- Move through value-flow and request-path steps sequentially with Previous/Next controls.
- Use `[` and `]` to step backward or forward while reading a path; text inputs are unaffected.
- Search symbols by label, qualified name, file, module, or graph ID—and open any cataloged file directly—from the universal command palette.
- Browse the graph hierarchy from module to file to symbol in the System Map.
- Reorder topology nodes by path order or centrality across graph paths, request paths, and relationships.
- Keep a local-only list of recent bundle metadata without storing bundle contents.

## A typical investigation

Explorer is a code-understanding surface first. Security findings can be layered on top, but they are
not required to use the graph. A useful first pass is:

1. Load a bundle and start with the suggested path in Briefing, or choose a question when you already
   know whether you want to follow a value, inspect a caller, find convergence, or understand the
   system shape.
2. Follow the highlighted path one step at a time. Each step is a graph relationship with source
   location and provenance, not a generated explanation.
3. Open the source inspector for the selected symbol to see its signature, module, relationships, and
   evidence before forming a conclusion.

The Briefing, Value flow, Request path, Graph, Convergence, and Revision diff views are different
lenses over the same bundle. They do not create new evidence; they help you move from a high-signal
path to the underlying graph and source.

### Keyboard workflow

- `Cmd/Ctrl+K` opens the command palette for views, symbols, values, and entrypoints.
- `/` focuses search where a lens supports filtering.
- `[` and `]` move to the previous or next step in a value flow or request path.
- `←` and `→` move between focused graph nodes; in the Trace lens, they change direction when no graph node is focused.
- `↑` and `↓` move between rows in the Topology lens; `Home` and `End` jump to the first or last graph node.
- `Esc` closes the current overlay or source inspector.
- The Help control in the footer shows the current shortcut list.

## Run locally

Requirements: Node.js 20+ and pnpm 11.25.0 via Corepack. The repository’s checked-in lockfile and CI use
pnpm; npm remains a supported fallback when you do not need a frozen CI install.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

With npm, use `npm install` followed by `npm run dev`.

Open [http://localhost:3000](http://localhost:3000). For a production build:

```bash
corepack pnpm run build
corepack pnpm run start
```

### Hosted bundle service

Hosted links use an opaque bundle ID and never put a repository URL or storage URL in the browser
address. Configure the build/artifact service with `NEXT_PUBLIC_BUNDLE_API_URL`; leave it empty
when a reverse proxy exposes the service at the same origin. The service must provide
`GET /api/bundles/{bundle_id}` and return the validated bundle JSON directly. The complete
deployment and rollback gate is in [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md).

Copy `.env.example` to `.env.local` for the configuration template. External production API URLs
must use HTTPS. The Lambda build service, private artifact storage, retention policy, and public
deployment gates are specified in [`docs/URL_INTAKE_SPEC.md`](docs/URL_INTAKE_SPEC.md).

## Bundle format

The explorer ships with two downloadable, explicitly synthetic fixtures. The app opens on [`code-exploration-bundle.json`](public/code-exploration-bundle.json), a graph-first bundle with symbols, modules, relationships, request paths, and no security findings. [`demo-bundle.json`](public/demo-bundle.json) is available as an explicit alternate for exercising security evidence states.

The preferred contract is `lachesis-explorer-bundle` `2.0`: a graph-first snapshot with optional `paths` and an optional `security.findings` overlay. The importer maps security evidence into the security lenses without making findings a prerequisite for code exploration. The existing `1.0` security envelope and earlier flow-centric shape remain available through backward-compatible adapters.

The full graph-first contract is documented in [`docs/GRAPH_EXPLORER_CONTRACT.md`](docs/GRAPH_EXPLORER_CONTRACT.md), with a machine-readable v2 schema at [`docs/GRAPH_EXPLORER_BUNDLE.schema.json`](docs/GRAPH_EXPLORER_BUNDLE.schema.json). It defines stable graph entities, source locations, hierarchy, path projections, capabilities, coverage, and limitations.

For a producer, the important distinction is between the graph and its projections: `graph.nodes` and
`graph.edges` describe the reusable code relationship layer, while `paths.values` and
`paths.requests` provide readable traversals through that graph. A path may include a short
`description`, explicit `source_node`/`sink_node`, confidence, and limitations so the UI can orient the
reader without inventing an interpretation. A value path may also declare a
display-only `kind` such as `value-flow`, `call-path`, or `data-flow`; this describes the traversal,
not a security verdict. A path step or hop should carry
an `occurrence_id` (unique within its path) when the same node appears more than once. This lets the
Explorer deep-link to the exact occurrence instead of only selecting a repeated symbol. Stable IDs are
also recommended for nodes, edges, flows, paths, files, modules, entrypoints, and findings.

For distributed or deeply nested code, nodes may include a `scope` object with stable
`repository`, `service`, `package`, `module`, and optional `kind`/`label` fields. The Explorer uses
adjacent scope changes to render boundary segments, highlight cross-context edges, and expose
external or generated nodes. Missing scope is supported for older bundles; those nodes fall back to
file and module context. Scope is descriptive graph context, not a security conclusion.

For source reading, nodes may also provide `parent_id` for their enclosing symbol and a
`source_window` containing surrounding lines plus optional highlight bounds. A node must provide
either a non-empty `snippet` or a non-empty `source_window`; this lets the Explorer preserve useful
context even when an exporter cannot reduce a whole symbol to one short snippet.

At minimum, a `2.0` bundle needs the `lachesis-explorer-bundle` format, `schema_version`, the required `meta` identity fields (`repository`, `language`, `revision`, `lines`, and `indexed_nodes`), and `graph.nodes`. Paths and findings may be omitted entirely. Legacy bundles need `graph.nodes` and `graph.flows`. Optional `meta.source_url_template` can link a selected symbol to a browsable source host using `{file}`, `{line}`, `{end_line}`, and `{revision}` placeholders. The Explorer validates the result as HTTP(S) and never infers a hosting provider. Optional fields include:

```json
{
  "format": "lachesis-explorer-bundle",
  "schema_version": "2.0",
  "meta": { "repository": "owner/repo", "description": "A short human-readable bundle description", "source_url_template": "https://github.com/owner/repo/blob/{revision}/{file}#L{line}", "language": "typescript", "revision": "abc123", "lines": 12345, "indexed_nodes": 0 },
  "graph": {
    "nodes": [
      { "id": "fn.search", "kind": "function", "file": "src/search.ts", "line": 1, "label": "search", "scope": { "repository": "owner/app", "service": "web-api", "package": "search" }, "snippet": "function search() {}", "source_window": { "start_line": 1, "lines": ["function search() {}"] } }
    ],
    "edges": [],
    "files": [],
    "modules": [],
    "entrypoints": [],
    "capabilities": [],
    "coverage": { "scope": "repository", "limitations": [] }
  }
}
```

`meta.description` is optional but recommended: it gives people immediate context when they switch
bundles in the app. `graph.coverage` should describe what was indexed, and graph, path, edge, and
evidence `limitations` should state what each projection cannot establish. Keep those limitations
close to the evidence so a partial graph is not mistaken for a complete call graph. When a legacy
bundle reports more indexed nodes than it includes, Explorer also surfaces a projected-subset notice
automatically.

Edges may use `source`/`target` (or `from`/`to`), a relationship `kind`, and optional `alias`, `dynamic`, `confidence`, or `limitations` metadata. The uncertainty fields are preserved in the source inspector so bounded or unresolved relationships remain explicit. When explicit edges are absent, Explorer derives clearly attributed relationships from flow and callpath sequences. Callpaths may provide `entry_node`, `hops`, and a `layout`. MCP evidence supports `tool` (or the legacy `verb`), object `args`, `result_summary`, `nodes`, `indirections`, and `hops`. The importer accepts both the current and compatible legacy field names where practical.

The `1.0` fixture follows the individual finding semantics described in the security section of
[`docs/GRAPH_EXPLORER_CONTRACT.md`](docs/GRAPH_EXPLORER_CONTRACT.md): status, confidence, guards, and
limitations remain separate concepts. It is a UX fixture, not a promise that the final engine export
will retain every wrapper field unchanged.

## Project structure

```text
app/page.tsx              state and view orchestration
app/globals.css           design tokens, responsive layout, themes
components/               header, views, icons, links, code blocks
lib/lachesis.ts           bundle types, starter data, normalization
docs/GRAPH_EXPLORER_CONTRACT.md
                           graph-first bundle contract
public/code-exploration-bundle.json
                           graph-only working fixture
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and review checklist. Before opening a pull request, run the build and strict TypeScript checks:

Please follow the project’s [Code of Conduct](CODE_OF_CONDUCT.md) when participating.

```bash
corepack pnpm run check
corepack pnpm run verify:bundles
```

To validate another local producer output without adding it to the repository:

```bash
corepack pnpm run verify:bundles -- /path/to/bundle.json
```

Please keep the JSON contract stable, keep evidence grounded in bundle data, and include a short note about responsive behavior when changing UI.

Please report vulnerabilities privately according to [SECURITY.md](SECURITY.md); do not attach real repository bundles to public issues.

Pull requests are checked automatically by [GitHub Actions](.github/workflows/ci.yml) for bundle-contract validation, type safety, and a production build.

## Analytics

The deployed Vercel app uses [Vercel Web Analytics](https://vercel.com/docs/analytics) for page views and client-side custom events. On non-Vercel hosting, set `NEXT_PUBLIC_ANALYTICS_ENABLED=true` to opt in explicitly. Events cover navigation and product interactions such as changing views or Graph lenses, toggling theme, selecting a graph path, request-path hop, topology node, or convergence node, changing path zoom, focusing or restoring path or convergence views, applying or clearing a semantic filter, loading a bundle, copying or downloading an investigation explanation, copying an investigation link, path sequence, source location, source snippet, or portable node context, opening a source repository or source file, copying an install command, and opening a related resource.

The frontend sends standard browser hardening headers, including no-referrer, MIME-sniffing
protection, frame denial, a restricted permissions policy, and HTTPS transport enforcement.

Semantic-filter events contain only the fixed surface and filter category; they never include query text or the selected filter value. All event payloads deliberately exclude repository names, filenames, code snippets, path values, and uploaded bundle contents. Analytics is best-effort; the explorer continues to work when it is unavailable.

## Related links

- [UnboundCompute](https://unboundcompute.com/) — the main site
- [Trace demo](https://trace.unboundcompute.com/) — casefiles and proof
- [UnboundCompute Security](https://security.unboundcompute.com/) — security research blog
- [Lachesis Explorer source repository](https://github.com/UnboundCompute/lachesis-explorer) — UI, issues, and docs
- [Lachesis source repository](https://github.com/UnboundCompute/lachesis)

## License

Released under the [MIT License](LICENSE). You are free to use, modify, and redistribute
Explorer, including in commercial and hosted contexts, provided the copyright notice and
license text are preserved.

The Lachesis reader that produces the `bundle.json` Explorer renders is a separate project
under its own license — see the [Lachesis repository](https://github.com/UnboundCompute/lachesis).
