# Graph Explorer Bundle Contract

This contract defines the data Lachesis Explorer needs to help a developer
understand a codebase. Security findings are an optional interpretation layer
over the graph; they must not be required for graph exploration.

## Envelope

Graph-first bundles use `format: "lachesis-explorer-bundle"` and
`schema_version: "2.0"`.

The format value is part of the envelope contract, not an informational
label. A `2.0` bundle with another format value is invalid and must be
rejected before it replaces the active bundle. The Explorer still accepts
older flow-centric bundles through its compatibility adapter.

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
`alias`, `confidence`, and `limitations` describe the relationship without
turning it into a security verdict. `confidence` is exporter-defined text
(for example, `high`, `medium`, or `low`); `limitations` is an array of
human-readable caveats. An exporter-provided edge `id` must be non-empty and
unique within `graph.edges`; the Explorer also guarantees that IDs it derives
from path projections cannot collide with those explicit IDs. The same
optional uncertainty fields may appear on a
path step or request-path hop when the path projection has more specific
context than the underlying edge.

Files and modules provide the hierarchy needed for progressive exploration:
repository → package → module/file → symbol → path. When modules or
entrypoints list node IDs, every listed node must exist in `graph.nodes`; their
IDs must also be unique within their respective collections so navigation
targets remain deterministic.

Entrypoints identify places a developer can start, including HTTP routes,
CLI commands, jobs, event handlers, public APIs, and exported functions.

## Paths and security

`paths.values` and `paths.requests` contain optional precomputed paths for fast
guided exploration. They are useful accelerators, not substitutes for the
underlying graph. Every value path must contain at least one valid `steps`
item; an empty value path is invalid because it cannot be traversed. Every
request path must contain at least one hop; an empty request path is invalid
because it cannot be traversed. When supplied, path IDs must be non-empty and
unique within their collection; finding IDs follow the same rule within
`security.findings`, and must not conflict with a value-path ID. Either path
collection may be omitted when the exporter has no corresponding projection.

`security.findings` contains the existing Lachesis finding envelopes. Each
finding should reference graph node and edge IDs where possible. A bundle with
zero findings remains valid and must present a clean security state rather
than failing to load. Findings without witness steps may remain as metadata,
but are not exposed as traceable paths until a witness is available.

## Scope and completeness

`indexed_nodes` describes the analyzed repository/index. The number of nodes in
`graph.nodes` describes the graph material included in this artifact. These
must remain separate so a projected security graph is not mistaken for a
complete repository graph. When present, `coverage.included_nodes` must equal
the number of nodes in `graph.nodes`, and `coverage.indexed_nodes` must be at
least that large.

`coverage.scope`, `coverage.limitations`, and `graph.capabilities` make missing
language constructs, unresolved calls, omitted dependencies, and projections
visible to the Explorer.

## Compatibility

The Explorer continues to accept the existing `0.x` flow-centric format and
`1.0` security envelope. New exporters should emit `2.0`; the UI may later add
chunk references under `graph.chunks` without changing the entity model.
