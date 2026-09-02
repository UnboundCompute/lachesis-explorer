---
name: Lachesis Explorer
description: A guided code-understanding workspace for deterministic code graphs.
colors:
  canvas: "#07100d"
  canvas-light: "#f1f4f1"
  surface: "#0d1a15"
  surface-raised: "#11231c"
  ink: "#e9f1ed"
  ink-muted: "#a5b7af"
  line: "#21382f"
  ambient-shadow: "rgba(0,0,0,.13)"
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
  workspace-title:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  control:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  body-compact:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  brand:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.2
  metric:
    fontFamily: "Berkeley Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
  section-title:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  dialog-title:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
  display-compact:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.05
  display-mobile:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.03
  display-install:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "37px"
    fontWeight: 700
    lineHeight: 1.02
  support:
    fontFamily: "Söhne, Avenir Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Berkeley Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  micro:
    fontFamily: "Berkeley Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "8px"
    fontWeight: 500
    lineHeight: 1.4
  nano:
    fontFamily: "Berkeley Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "7px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  micro: "5px"
  micro-lg: "6px"
  compact: "7px"
  small: "8px"
  control: "9px"
  control-md: "10px"
  control-lg: "11px"
  card: "12px"
  card-md: "13px"
  card-lg: "14px"
  panel: "16px"
  dialog: "17px"
  shell: "18px"
  pill: "999px"
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

**Creative North Star: "The Guided Code Map"**

Lachesis should feel like a precise map for unfamiliar code: dark mineral surfaces, sparse luminous signals, readable explanations, and clearly bounded working areas. It is focused enough for first-time comprehension and dense enough for sustained technical work without becoming a generic graph dashboard.

The interface privileges the developer's question, a focused path, source context, and graph provenance—in that order. Decoration stays atmospheric and quiet; semantic state carries the strongest color.

**Key Characteristics:**

- Dark-first, locally operated, and task-first.
- Four top-level jobs—Understand, Trace, Explore, and Compare—surrounding a wide code canvas.
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

The understanding surface begins with “what do you want to understand?” and recommends one complete bundled path. Graph mechanics, alternate paths, provenance, and security-specific triage appear only after the primary question or when the loaded bundle explicitly uses the security projection.

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

Navigation exposes four plain-language jobs: Understand, Trace, Explore, and Compare. Request flow, convergence, setup, and security-specific views remain available through contextual actions or More. The command palette is the fast path; URL state, keyboard movement, and direct controls must remain equivalent.

### Evidence Path

Nodes are keyboard-selectable circles with stable numbering. Exact edges are solid neutral lines, aliases use violet dashes, dynamic edges use amber dots, and sinks receive coral outlines. Fit and Reset change only the viewport, never graph evidence.

### Evidence Queue

The briefing ranks finding envelopes by review state: leads first, then inconclusive, verified, and refuted evidence. Status, confidence, guards, and limitations are separate fields and must never be collapsed into one risk score. The primary witness pairs a source-to-boundary rail with a direct trace action; alternate findings remain one click away.

### Evidence Capsule

Evidence capsules show provenance, confidence, witness size, guard observations, and every bundled limitation. Lead uses amber, unresolved evidence uses violet, effective guards use green, and exact evidence uses cyan. These colors reinforce explicit labels rather than replacing them.

### Sink Field

Sink-first investigation uses coral sparingly as a boundary signal. The convergence field merges shared nodes across value flows, while the evidence matrix exposes the same facts in a comparison-friendly form. Request overlap must always be labeled as overlap rather than reachability.

### Investigation Trail

The fixed Trail control opens a right-side provenance drawer. Events remain local, use compact chronological notation, and can be exported as Markdown. The drawer behaves as a modal with trapped focus, Escape dismissal, and focus restoration.

## Do's and Don'ts

- Do state whether evidence and layouts are exact, bundled, or derived.
- Do label synthetic fixtures at the bundle level and keep their status vocabulary identical to production evidence.
- Do keep status, confidence, lifecycle, guard verdict, and limitations independently readable.
- Do keep source context one selection or command away.
- Do preserve visible focus, reduced motion, and non-color state cues.
- Don't introduce generic blue dashboard accents, glass cards, or decorative gradients inside working panels.
- Don't fabricate graph content, repository metadata, evidence, or confidence.
- Don't send repository names, filenames, code, values, or bundle contents through analytics.
