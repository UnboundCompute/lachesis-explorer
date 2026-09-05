# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers trying to understand an unfamiliar or complex codebase. Application-security engineers and technical evaluators are important secondary users of the same graph.

## Product Purpose

Lachesis Explorer turns a deterministic Lachesis `bundle.json` into a guided code-understanding workspace. Success means a developer can start with a familiar question, follow one focused behavior through the graph, inspect its source without losing context, and share what they learned faster than they could by manually jumping through files and references.

## Positioning

The explorer is the understanding layer over Lachesis graphs. It turns compiler-derived relationships and explicit MCP results into inspectable paths rather than generated guesses. Security findings are a specialized projection, not the default language of the product.

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

1. Start with the developer's question, not the graph's data model.
2. Prefer a focused path over a wall of nodes.
3. Source context is always one action away.
4. Every useful explanation can leave the product as a portable artifact.
5. Missing or conservative graph data stays visibly missing or conservative.
6. The workspace remains fast, keyboard-friendly, and locally operated.

## Accessibility & Inclusion

All core actions must be keyboard reachable, preserve visible focus, support reduced motion, retain readable contrast in both themes, and remain usable without relying on color alone.
