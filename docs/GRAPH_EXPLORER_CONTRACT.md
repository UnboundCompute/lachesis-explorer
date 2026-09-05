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

Producers should include an `analysis_projection` string at the top level.
Use `code-understanding` when the bundle is selected to teach a reader how
the codebase is organized and how a representative behavior travels through
it; use `security-evidence` (or another value containing `security` or
`audit`) when the bundle is selected primarily for security witnesses. This
explicit value takes precedence over the presence of optional security
findings, so adding a finding to an understanding bundle must not turn its
default UI into an audit queue.

`graph.nodes` must contain at least one node. An empty graph cannot provide a
meaningful exploration surface and should be reported as an export error
rather than loaded as a successful snapshot.

```json
{
  "format": "lachesis-explorer-bundle",
  "schema_version": "2.0",
  "meta": {
    "repository": "example/app",
    "language": "typescript",
    "revision": "9f6c2ad",
    "description": "Request and value paths through the search flow.",
    "source_url_template": "https://github.com/example/app/blob/{revision}/{file}#L{line}",
    "lines": 28416,
    "indexed_nodes": 193057
  },
  "graph": {
    "nodes": [
      {"id": "fn.search", "kind": "function", "file": "src/search.ts", "line": 1, "label": "search", "snippet": "function search() {}"}
    ],
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

Every node has a stable `id`, semantic `kind`, and display `label`, plus optional
`qualified_name`, `module`, `signature`, `documentation`, `snippet`, or
`source_window`. Locations may include an end line and column. Source context is
optional for graph-only nodes so architecture consumers can inspect shape before
source retrieval is available; any featured code-understanding path must still
use source-backed nodes.
Concrete source nodes use a repository-relative `file`. Synthetic or unmapped
nodes use an empty `file` string and line `0`; the Explorer identifies their
source as unavailable and does not offer a repository jump.
Nodes may optionally provide `parent_id` to identify their enclosing symbol,
such as a method’s class or a nested function’s parent. It must reference a
node in the same graph and must not reference the node itself.
For a more useful source-reading surface, exporters may also provide a
`source_window` object with a one-based `start_line` and an ordered `lines`
array. `highlight_start` and `highlight_end` optionally identify the lines in
that window belonging to the node. This is source context, not a replacement
for the repository; the Explorer falls back to `snippet` for older bundles.
Kinds are treated as case-insensitive semantic labels; new exporters should
prefer lowercase kebab-case values such as `function`, `call`, `expression`,
and `source-sink`.

Nodes may also include a `scope` object with optional `repository`, `service`,
`package`, `module`, `kind`, and display `label` fields. This is context for
progressive exploration, not a security verdict. The Explorer uses adjacent
scope changes to show where a path crosses a repository, service, package, or
other exporter-defined boundary. Exporters should provide stable values for
every node in a distributed path; older bundles without `scope` remain valid
and continue to use file/module context only.

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

Path step `role` values describe the node's position in a path (`origin`,
`transform`, `sink`, and similar labels); they are not necessarily edge
relationships. Producers may provide `step.edge.relation` when the projected
relationship needs to be explicit. Otherwise the Explorer uses `value flows to` for
endpoint roles and treats other roles as relationship labels.

After normalization, every relationship retains one or more provenance origins:
`bundle` for an explicit `graph.edges` record, `value-flow` for a relationship
derived from a value-path sequence, and `request-path` for one derived from a
request-path sequence. A relationship may have multiple origins when an
exported edge and a path projection describe the same pair. The Graph lens
surfaces these origins and supports `edge:explicit`, `edge:derived`,
`origin:value-flow`, and `origin:request-path` filters; these labels describe
how the relationship entered the bundle, not a security verdict.

Files and modules provide the hierarchy needed for progressive exploration:
repository → package → module/file → symbol → path. When modules or
entrypoints list node IDs, every listed node must exist in `graph.nodes`; their
IDs must also be unique within their respective collections so navigation
targets remain deterministic. Modules may use `parent_id` to describe nesting;
the parent must reference another module in the same bundle, and a module cannot
be its own parent or participate in a parent cycle. A module's `node_ids` should
not repeat a graph node, because repeated membership makes architecture counts
and navigation ambiguous.

Entrypoints identify places a developer can start, including HTTP routes,
CLI commands, jobs, event handlers, public APIs, and exported functions.

Optional `graph.concepts` records provide a small architecture map for Guided
mode. A concept is an exporter-authored explanation of a code area or idea,
not a security claim. Each concept has a stable `id`, a reader-facing `label`,
an optional `description`, and optional `node_ids` pointing to the symbols that
make the concept concrete. `related_ids` may connect concepts, but must point
to other concept IDs and must not repeat. Unknown node or concept references,
duplicate IDs, and self-references are invalid. Exporters should prefer a few
meaningful concepts such as a request lifecycle, a query pipeline, or a service
boundary over one concept per module; the Explorer falls back to modules when
the optional map is absent.

When a bundle can link back to a browsable source repository, `meta.source_url_template`
may provide an HTTP(S) template with a required `{file}` placeholder and optional
`{line}`, `{end_line}`, and `{revision}` placeholders. The Explorer only renders an external source link
when this field is present and produces a valid HTTP(S) URL; it never guesses a
hosting provider from the repository name. Producers should include the line
range fragment when their host supports it, for example
`https://github.com/example/app/blob/{revision}/{file}#L{line}-L{end_line}`.

## Paths and security

`paths.values` and `paths.requests` contain optional precomputed paths for fast
guided exploration. `paths.value_flows` and `paths.request_paths` are accepted
compatibility aliases, but new exporters should use the shorter canonical
names. They are useful accelerators, not substitutes for the underlying graph.
Every value path must contain at least one valid `steps`
item; an empty value path is invalid because it cannot be traversed. Every
request path must contain at least one hop; an empty request path is invalid
because it cannot be traversed. When supplied, path IDs must be non-empty and
unique within their collection; finding IDs follow the same rule within
`security.findings`, and must not conflict with a value-path ID. Either path
collection may be omitted when the exporter has no corresponding projection.

Paths may include `kind`, `description`, `confidence`, and `limitations` to
give the reader exporter-authored context without turning the projection into
a claim. `kind` is a display and filtering hint, not a security verdict;
recommended values include `value-flow`, `call-path`, `data-flow`, and
`security-witness`. The collection still determines the default traversal
surface (`paths.values` or `paths.requests`).
`source_node` and `sink_node` are optional explicit endpoints; when present,
they must reference graph node IDs. The Explorer uses this metadata for
orientation and preserves the path sequence as the authoritative traversal.
Steps and hops should provide an `id` that is stable and unique within that
path. This occurrence identity lets clients distinguish repeated visits to the
same graph node; `node_id` remains the canonical graph-entity reference. The
field remains optional when reading older bundles, with the Explorer deriving a
deterministic fallback.

`security.findings` contains the existing Lachesis finding envelopes. Each
finding should reference graph node and edge IDs where possible. A bundle with
zero findings remains valid and must present a clean security state rather
than failing to load. Findings without witness steps may remain as metadata,
but are not exposed as traceable paths until a witness is available.

### Code-understanding projection requirements

For `analysis_projection: "code-understanding"`, the default guided surface
must be useful without security findings. A producer should provide:

- at least one `graph.entrypoints` record for a public API, request handler,
  CLI command, job, event handler, or exported function, with `node_id` mapped
  to a concrete graph node;
- at least one `paths.requests` or `paths.values` path with three or more
  distinct, source-backed nodes, a meaningful `kind` such as `call-path` or
  `data-flow`, and explicit `source_node` / `sink_node` metadata when the
  endpoints are known; shorter paths may remain bundled for lookup but must
  not become the featured understanding path;
- `graph.modules` and/or node `module` / `scope` metadata sufficient to group
  the included symbols into real code areas; and
- `coverage.limitations` that names omitted dependencies, unresolved calls,
  or projection boundaries rather than implying that the bundle is complete.

The featured path must not be a self-loop, a single-node witness, or a path
whose nodes all lack file locations and source text. Security findings may be
included as an optional overlay, but they must not replace the understanding
paths or entrypoint metadata in the default projection.

Top-level `mcp` records are an independent provenance layer and may be present
even when `security.findings` is absent. Their `for`/`flow` value identifies the
path or finding they explain, and their node references must resolve against
`graph.nodes`. When a finding also produces derived evidence for the same ID,
the explicit MCP record takes precedence. `graph.mcp` is accepted as a
compatibility location for producers that keep all graph evidence together.

## Scope and completeness

`indexed_nodes` describes the analyzed repository/index. The number of nodes in
`graph.nodes` describes the graph material included in this artifact. These
must remain separate so a projected security graph is not mistaken for a
complete repository graph. When present, `coverage.included_nodes` must equal
the number of nodes in `graph.nodes`, and `coverage.indexed_nodes` must be at
least that large.

`meta.description` is optional exporter-authored context for the graph
projection. The Explorer may show it as orientation copy, but must not infer or
rewrite it into a security conclusion.

An optional `meta.curated_tour` gives newcomers a publisher-selected reading
sequence. Each `steps[].flow_id` must resolve to a path in the same bundle;
`node_id`, when present, must resolve to a step in that path. The Explorer
silently omits invalid tour steps and only renders the tour when at least one
path remains. A `maintainer` object is accepted for publisher provenance only
when it contains `verified: true`; that flag must be added by an authenticated
repository-ownership flow or another trusted service boundary, never inferred
from a public README badge or from bundle self-assertion alone. The current UI
labels this as publisher-provided context, not as an independent ownership claim.

`coverage.scope`, `coverage.limitations`, and `graph.capabilities` make missing
language constructs, unresolved calls, omitted dependencies, and projections
visible to the Explorer. If `indexed_nodes` is greater than the number of
included graph nodes and no equivalent limitation is supplied, the Explorer
adds a clearly labelled projected-subset notice; exporters should still state
the precise reason and boundary whenever they can.

## Compatibility

The Explorer continues to accept the existing `0.x` flow-centric format and
`1.0` security envelope. New exporters should emit `2.0`; the UI may later add
chunk references under `graph.chunks` without changing the entity model.
