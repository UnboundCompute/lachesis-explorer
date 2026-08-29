---
name: Lachesis Explorer
description: A forensic evidence workbench for deterministic code graphs.
colors:
  canvas: "#07100d"
  canvas-light: "#f1f4f1"
  surface: "#0d1a15"
  surface-raised: "#11231c"
  ink: "#e9f1ed"
  ink-muted: "#a5b7af"
  line: "#21382f"
  evidence-green: "#58d6a1"
  exact-cyan: "#70cfe2"
  dynamic-amber: "#e4b464"
  sink-coral: "#f07868"
  alias-violet: "#b5a5e8"
typography:
  display:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(28px, 3vw, 46px)"
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Berkeley Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
rounded:
  control: "9px"
  panel: "16px"
  shell: "18px"
spacing:
  tight: "8px"
  control: "12px"
  panel: "20px"
  section: "30px"
components:
  button-primary:
    backgroundColor: "{colors.evidence-green}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    padding: "7px 8px 7px 13px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px"
---

# Design System: Lachesis Explorer

## Overview

**Creative North Star: "The Forensic Mineral Workbench"**

Lachesis should feel like a precise instrument used to inspect evidence: dark mineral surfaces, sparse luminous signals, compact technical labels, and clearly bounded working areas. It is dense enough for sustained analysis but avoids the visual noise of a generic security dashboard.

The interface privileges graph state, source context, and evidence provenance. Decoration stays atmospheric and quiet; semantic state carries the strongest color.

**Key Characteristics:**

- Dark-first, locally operated, and task-first.
- Compact navigation surrounding a wide evidence canvas.
- Semantic color reinforced by labels, shapes, and line styles.
- Rounded panels with restrained depth and crisp internal boundaries.

## Colors

The palette pairs deep green-black neutrals with mineral accents that have fixed analytical meanings.

- **Evidence Green** (`#58d6a1`): active selections, ready state, and primary actions.
- **Exact Cyan** (`#70cfe2`): exact MCP evidence, precomputed layouts, guards, and focus.
- **Dynamic Amber** (`#e4b464`): dynamic edges, derived summaries, demo state, and caution.
- **Sink Coral** (`#f07868`): sinks, destructive boundaries, errors, and close-hover feedback.
- **Alias Violet** (`#b5a5e8`): aliases and indirection.
- **Canvas / Surface / Ink**: use tonal layering for structure; reserve accents for meaning.

**The Evidence Rule.** Never use cyan, amber, coral, or violet as interchangeable decoration. Their semantic assignments are stable in both themes, and text or line style must accompany color.

## Typography

**Display and Body Font:** Söhne with Avenir Next and system sans-serif fallbacks.  
**Label and Code Font:** Berkeley Mono with system monospace fallbacks.

Sans-serif copy keeps the shell calm and readable. Monospace type identifies source locations, graph identifiers, code, metrics, and compact control labels.

- **Display:** 700 weight, `clamp(28px, 3vw, 46px)`, 1.03 line height; limited to the repository context heading.
- **Title:** 600–700 weight, 17–18px; selected values and requests.
- **Body:** 400 weight, 10–13px, 1.5–1.7 line height; explanations and evidence summaries.
- **Label:** 700 weight, 8–9px, uppercase with tracking; section labels and status metadata.

## Layout

The desktop workspace is a three-part evidence bench: a 244px selector rail, a fluid canvas, and a 260px source inspector. Closing the inspector expands the canvas. At 1040px the inspector becomes a full-width row; at 760px all regions stack, preserving the inspector below the canvas. Containers cap at 1440px with 30px desktop and 16px mobile gutters.

Spacing is intentionally compact. Use 8px gaps between adjacent panels, 12px for controls, 20–22px inside working panels, and 30px for outer section gutters.

## Elevation & Depth

Depth is primarily tonal: canvas, raised canvas, surface, and raised surface form the hierarchy. The floating header and transient overlays alone receive broad ambient shadows. Internal cards rely on one-pixel borders or inset highlights rather than independent shadows.

## Shapes

Controls use 7–12px radii, working panels use 14–16px, and the floating shell uses 18px. Adjacent workspace panels use asymmetrical corners to read as one instrument. Pills are reserved for node kinds and compact state badges, not general actions.

## Components

### Buttons

Primary actions use evidence green, dark text, and a compact 9–12px radius. Secondary controls use a tonal surface and one-pixel border. Hover raises shell actions by 2px; focus always uses a visible exact-cyan outline.

### Cards and Containers

Working panels use `surface`; canvas and code areas use `canvas` or `canvas-raised`. Prefer internal dividers and tonal contrast. Only floating menus, dialogs, and the sticky header use ambient elevation.

### Inputs and Fields

Fields are compact, dark tonal wells with a one-pixel line and monospace text where the content is graph- or source-oriented. Inputs retain explicit labels or accessible names and a visible cyan focus ring.

### Navigation

Navigation is a compact set of analysis lenses with a quiet default and green active state. The command palette is the fast path; URL state, keyboard movement, and direct controls must remain equivalent.

### Evidence Path

Nodes are keyboard-selectable circles with stable numbering. Exact edges are solid neutral lines, aliases use violet dashes, dynamic edges use amber dots, and sinks receive coral outlines. Fit and Reset change only the viewport, never graph evidence.

## Do's and Don'ts

- Do state whether evidence and layouts are exact, bundled, or derived.
- Do keep source context one selection or command away.
- Do preserve visible focus, reduced motion, and non-color state cues.
- Don't introduce generic blue dashboard accents, glass cards, or decorative gradients inside working panels.
- Don't fabricate graph content, repository metadata, evidence, or confidence.
- Don't send repository names, filenames, code, values, or bundle contents through analytics.
