# Lachesis Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Live demo](https://img.shields.io/badge/demo-lachesis.unboundcompute.com-brightgreen.svg)](https://lachesis.unboundcompute.com)

The browser companion for [Lachesis](https://github.com/UnboundCompute/lachesis), a compiler-precise code property graph for following values, calls, and source-to-sink paths through a codebase.

Explorer loads a Lachesis `bundle.json` locally and makes the graph readable without a server or model in the loop. It is designed for inspecting deterministic evidence: where a value originated, which nodes it reaches, and how a request travels through an application.

## What it does

- Trace a value backward to its origin or forward to its sink.
- Start from a sink and reveal every bundled value flow converging on it.
- Compare reaching flows in an evidence matrix with alias, dynamic-edge, and MCP provenance.
- Show node source, file locations, aliases, dynamic edges, and MCP evidence.
- Walk a request callpath hop by hop with baked graph layout when available.
- Filter flows with semantic terms such as `edge:dynamic`, `kind:sink`, `file:db/`, and `has:mcp`.
- Capture a local investigation trail and export it as Markdown.
- Load any compatible `bundle.json` from the browser.
- Switch between light and dark themes; the preference is saved locally.
- Jump to views, values, or entrypoints with `Cmd/Ctrl+K`; deep links preserve the active graph selection.
- Copy a local link to the selected graph node, value-flow step, or request-path hop.
- Copy a selected symbol’s `file:line:column` location from the source inspector.
- Move through value-flow and request-path steps sequentially with Previous/Next controls.
- Use `[` and `]` to step backward or forward while reading a path; text inputs are unaffected.
- Search symbols by label, qualified name, file, module, or graph ID from the universal command palette.
- Browse the graph hierarchy from module to file to symbol in the System Map.
- Keep a local-only list of recent bundle metadata without storing bundle contents.

## Run locally

Requirements: Node.js 20+ and npm (pnpm is also supported by the workspace configuration).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production build:

```bash
npm run build
npm run start
```

## Bundle format

The explorer ships with two downloadable, explicitly synthetic fixtures: [`demo-bundle.json`](public/demo-bundle.json) exercises security evidence states, while [`code-exploration-bundle.json`](public/code-exploration-bundle.json) demonstrates a graph-first bundle with symbols, modules, relationships, request paths, and no security findings.

The preferred contract is `lachesis-explorer-bundle` `2.0`: a graph-first snapshot with optional `paths` and an optional `security.findings` overlay. The importer maps security evidence into the security lenses without making findings a prerequisite for code exploration. The existing `1.0` security envelope and earlier flow-centric shape remain available through backward-compatible adapters.

The full graph-first contract is documented in [`docs/GRAPH_EXPLORER_CONTRACT.md`](docs/GRAPH_EXPLORER_CONTRACT.md). It defines stable graph entities, source locations, hierarchy, path projections, capabilities, coverage, and limitations.

At minimum, a `2.0` bundle needs `schema_version`, `graph.nodes`, and may omit paths and findings entirely. Legacy bundles need `graph.nodes` and `graph.flows`. Optional fields include:

```json
{
  "meta": { "repo": "owner/repo", "lang": "typescript", "commit": "abc123", "loc": 12345 },
  "graph": {
    "nodes": [],
    "edges": [],
    "flows": [],
    "callpaths": []
  },
  "mcp": []
}
```

Edges may use `source`/`target` (or `from`/`to`), a relationship `kind`, and optional `alias`, `dynamic`, `confidence`, or `limitations` metadata. The uncertainty fields are preserved in the source inspector so bounded or unresolved relationships remain explicit. When explicit edges are absent, Explorer derives clearly attributed relationships from flow and callpath sequences. Callpaths may provide `entry_node`, `hops`, and a `layout`. MCP evidence supports `tool` (or the legacy `verb`), object `args`, `result_summary`, `nodes`, `indirections`, and `hops`. The importer accepts both the current and compatible legacy field names where practical.

The `1.0` fixture follows the individual finding semantics documented in the monorepo’s `docs/OSS_EVIDENCE_CONTRACT.md`: status, confidence, guards, and limitations remain separate concepts. It is a UX fixture, not a promise that the final engine export will retain every wrapper field unchanged.

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

```bash
npm run check
npm run verify:bundles
```

Please keep the JSON contract stable, keep evidence grounded in bundle data, and include a short note about responsive behavior when changing UI.

Please report vulnerabilities privately according to [SECURITY.md](SECURITY.md); do not attach real repository bundles to public issues.

Pull requests are checked automatically by [GitHub Actions](.github/workflows/ci.yml) for bundle-contract validation, type safety, and a production build.

## Analytics

The deployed app uses [Vercel Web Analytics](https://vercel.com/docs/analytics) for page views and client-side custom events. Events cover navigation and product interactions such as changing views, toggling theme, selecting a flow or callpath hop, loading a bundle, copying an investigation link or install command, and opening a related resource.

Event payloads deliberately exclude repository names, filenames, code snippets, flow values, and uploaded bundle contents. Analytics is best-effort; the explorer continues to work when it is unavailable.

## Related links

- [UnboundCompute](https://unboundcompute.com/) — the main site
- [Trace demo](https://trace.unboundcompute.com/) — casefiles and proof
- [UnboundCompute Security](https://security.unboundcompute.com/) — security research blog
- [Lachesis source repository](https://github.com/UnboundCompute/lachesis)

## License

Released under the [MIT License](LICENSE). You are free to use, modify, and redistribute
Explorer, including in commercial and hosted contexts, provided the copyright notice and
license text are preserved.

The Lachesis reader that produces the `bundle.json` Explorer renders is a separate project
under its own license — see the [Lachesis repository](https://github.com/UnboundCompute/lachesis).
