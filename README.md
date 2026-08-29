# Lachesis Explorer

The browser companion for [Lachesis](https://github.com/UnboundCompute/lachesis), a compiler-precise code property graph for following values, calls, and source-to-sink paths through a codebase.

Explorer loads a Lachesis `bundle.json` locally and makes the graph readable without a server or model in the loop. It is designed for inspecting deterministic evidence: where a value originated, which nodes it reaches, and how a request travels through an application.

## What it does

- Trace a value backward to its origin or forward to its sink.
- Show node source, file locations, aliases, dynamic edges, and MCP evidence.
- Walk a request callpath hop by hop with baked graph layout when available.
- Load any compatible `bundle.json` from the browser.
- Switch between light and dark themes; the preference is saved locally.
- Jump to views, values, or entrypoints with `Cmd/Ctrl+K`; deep links preserve the active graph selection.
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

The explorer accepts the Lachesis bundle shape and preserves the graph data rather than inventing results. At minimum, a bundle needs `graph.nodes` and `graph.flows`. Optional fields include:

```json
{
  "meta": { "repo": "owner/repo", "lang": "typescript", "commit": "abc123", "loc": 12345 },
  "graph": {
    "nodes": [],
    "flows": [],
    "callpaths": []
  },
  "mcp": []
}
```

Callpaths may provide `entry_node`, `hops`, and a `layout`. MCP evidence supports `tool` (or the legacy `verb`), object `args`, `result_summary`, `nodes`, `indirections`, and `hops`. The importer accepts both the current and compatible legacy field names where practical.

## Project structure

```text
app/page.tsx              state and view orchestration
app/globals.css           design tokens, responsive layout, themes
components/               header, views, icons, links, code blocks
lib/lachesis.ts           bundle types, starter data, normalization
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and review checklist. Before opening a pull request, run the build and strict TypeScript checks:

```bash
npm run check
```

Please keep the JSON contract stable, keep evidence grounded in bundle data, and include a short note about responsive behavior when changing UI.

## Analytics

The deployed app uses [Vercel Web Analytics](https://vercel.com/docs/analytics) for page views and client-side custom events. Events cover navigation and product interactions such as changing views, toggling theme, selecting a flow or callpath hop, loading a bundle, copying an install command, and opening a related resource.

Event payloads deliberately exclude repository names, filenames, code snippets, flow values, and uploaded bundle contents. Analytics is best-effort; the explorer continues to work when it is unavailable.

## Related links

- [UnboundCompute](https://unboundcompute.com/) — the main site
- [Trace demo](https://trace.unboundcompute.com/) — casefiles and proof
- [UnboundCompute Security](https://security.unboundcompute.com/) — security research blog
- [Lachesis source repository](https://github.com/UnboundCompute/lachesis)

## License

See the repository’s license and contribution policies before redistributing or extending this project.
