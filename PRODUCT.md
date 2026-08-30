# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers, application-security engineers, and technical evaluators inspecting how values and requests move through a source-code graph.

## Product Purpose

Lachesis Explorer turns a deterministic Lachesis `bundle.json` into an interactive evidence workbench. Success means a user can load a bundle, select a value or entrypoint, follow the resulting path, inspect the source node, and understand the evidence without a model or server inventing an answer.

## Positioning

The explorer renders compiler-derived graph evidence and explicit MCP results. It treats paths as inspectable evidence rather than generated explanations or scanner verdicts.

## Operating Context

Users work with local code repositories, generated JSON bundles, source locations, value-flow paths, request callpaths, aliases, dynamic edges, sinks, and MCP evidence. The interface is used as a sustained technical analysis tool on desktop and must remain workable on smaller screens.

## Capabilities and Constraints

- Load a compatible `bundle.json` entirely in the browser.
- Trace values forward and backward through graph nodes.
- Investigate sinks first and compare every bundled value flow that reaches them.
- Normalize explicit and path-derived relationships while retaining their provenance.
- Walk request callpaths using baked layout coordinates when provided.
- Inspect node source, role, edge metadata, and MCP evidence.
- Capture and export local investigation history without sending it through analytics.
- Preserve current and compatible legacy bundle field names.
- Never fabricate repository data, evidence, paths, or counts.
- Never send source content, filenames, repository names, or uploaded bundle data through analytics.
- Light and dark themes must share the same semantic meanings.

## Brand Commitments

The product name is Lachesis. The voice is precise, concise, technically honest, and explicit about what is exact, conservative, unavailable, or derived. UnboundCompute and Lachesis reference links remain available without distracting from analysis.

## Evidence on Hand

- The starter bundle in `lib/lachesis.ts` is explicitly demo data.
- Imported nodes, flows, callpaths, layouts, and MCP records are the authoritative runtime evidence.
- No testimonials, customer claims, or benchmark claims are available and none should be invented.

## Product Principles

1. Evidence before interpretation.
2. Source context is always one action away.
3. Color and labels communicate graph semantics, not decoration.
4. Missing or conservative evidence stays visibly missing or conservative.
5. The workspace remains fast, keyboard-friendly, and locally operated.

## Accessibility & Inclusion

All core actions must be keyboard reachable, preserve visible focus, support reduced motion, retain readable contrast in both themes, and remain usable without relying on color alone.
