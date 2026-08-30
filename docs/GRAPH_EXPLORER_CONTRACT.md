# Graph Explorer Bundle Contract

This contract defines the data Lachesis Explorer needs to help a developer
understand a codebase. Security findings are an optional interpretation layer
over the graph; they must not be required for graph exploration.

## Envelope

Graph-first bundles use `format: "lachesis-explorer-bundle"` and
`schema_version: "2.0"`.

```json
{
  "format": "lachesis-explorer-bundle",
  "schema_version": "2.0",
  "meta": {
    "repository": "example/app",
    "language": "typescript",
    "revision": "9f6c2ad",
    "lines": 28416,
    "indexed_nodes": 193057
  },
  "graph": {
    "nodes": [],
    "edges": [],
    "files": [],
    "modules": [],
    "entrypoints": [],
    "capabilities": [],
    "coverage": {"scope": "repository", "limitations": []}
  },
  "paths": {"values": [], "requests": []},
  "security": {"findings": []}
}
```

## Graph entities

Every node has a stable `id`, semantic `kind`, display `label`, source
location, and optional `qualified_name`, `module`, `signature`,
`documentation`, and `snippet`. Locations may include an end line and column.

Edges use a semantic `kind` such as `calls`, `imports`, `reads`, `writes`,
`returns`, `implements`, `inherits`, `data-flow`, or `controls`. `dynamic`,
`confidence`, and `limitations` describe the relationship without turning it
into a security verdict.

Files and modules provide the hierarchy needed for progressive exploration:
repository → package → module/file → symbol → path.

Entrypoints identify places a developer can start, including HTTP routes,
CLI commands, jobs, event handlers, public APIs, and exported functions.

## Paths and security

`paths.values` and `paths.requests` contain optional precomputed paths for fast
guided exploration. They are useful accelerators, not substitutes for the
underlying graph.

`security.findings` contains the existing Lachesis finding envelopes. Each
finding should reference graph node and edge IDs where possible. A bundle with
zero findings remains valid and must present a clean security state rather
than failing to load.

## Scope and completeness

`indexed_nodes` describes the analyzed repository/index. The number of nodes in
`graph.nodes` describes the graph material included in this artifact. These
must remain separate so a projected security graph is not mistaken for a
complete repository graph.

`coverage.scope`, `coverage.limitations`, and `graph.capabilities` make missing
language constructs, unresolved calls, omitted dependencies, and projections
visible to the Explorer.

## Compatibility

The Explorer continues to accept the existing `0.x` flow-centric format and
`1.0` security envelope. New exporters should emit `2.0`; the UI may later add
chunk references under `graph.chunks` without changing the entity model.
