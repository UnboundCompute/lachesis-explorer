"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { copyText, downloadText } from "../lib/clipboard";
import { explainEntry } from "../lib/explanations";
import { Icon } from "./Icon";
import { PathCanvas, type PathItem } from "./PathCanvas";
import { NodeInspector } from "./NodeInspector";
import { EvidencePanel } from "./EvidencePanel";

function nodeLocation(node: App["nodes"][number] | undefined) {
  return node ? `${node.file || "Source location unavailable"}:${node.line || "—"}` : "Source location unavailable";
}
function nodeContext(node: App["nodes"][number] | undefined) {
  return node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository || "";
}
const hasSource = (node: App["nodes"][number] | undefined) => Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
type NodeIndex = ReadonlyMap<string, App["nodes"][number]>;

function matchingHopIndex(entry: App["entries"][number], query: string, nodeById: NodeIndex) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term && !term.includes(":"));
  if (!terms.length) return -1;
  const entryHaystack = [
    entry.label,
    entry.description,
    entryContext(entry, nodeById),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hopTerms = terms.filter((term) => !entryHaystack.includes(term));
  if (!hopTerms.length) return -1;

  return entry.hops.findIndex((hop) => {
    const node = nodeById.get(hop.node_id);
    const haystack = [
      hop.edge_label,
      hop.caption,
      node?.label,
      node?.file,
      node?.module,
      node?.scope?.module,
      node?.snippet,
      node?.sourceWindow?.lines.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hopTerms.every((term) => haystack.includes(term));
  });
}

function entryContext(entry: App["entries"][number], nodeById: NodeIndex) {
  return nodeContext(nodeById.get(entry.hops[0]?.node_id ?? ""));
}
function entryScopes(entry: App["entries"][number], nodeById: NodeIndex) {
  const scopes: string[] = [];
  entry.hops.forEach((hop) => {
    const scope = nodeContext(nodeById.get(hop.node_id));
    if (scope && scopes.at(-1) !== scope) scopes.push(scope);
  });
  return scopes;
}
type Props = {
  app: App;
  entryIndex: number;
  setEntryIndex: (v: number) => void;
  hopId: string;
  setHopId: (v: string) => void;
  position?: number;
  onPositionChange?: (position: number) => void;
  inspectorOpen: boolean;
  onInspectorOpen: () => void;
  onInspectorClose: () => void;
  onRecord: (action: string, target: string, detail: string) => void;
  onView: (view: "trace" | "map", nodeId?: string) => void;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (entryIndex: number, nodeId: string) => void;
  onFile?: (file: string) => void;
  onShare?: (params: Record<string, string>) => Promise<boolean>;
};
export function JourneyView({
  app,
  entryIndex,
  setEntryIndex,
  hopId,
  setHopId,
  position,
  onPositionChange,
  inspectorOpen,
  onInspectorOpen,
  onInspectorClose,
  onRecord,
  onView,
  onFlow,
  onEntry,
  onFile,
  onShare,
}: Props) {
  const entry = app.entries[entryIndex] ?? app.entries[0];
  const nodeById = useMemo(() => new Map(app.nodes.map((node) => [node.id, node])), [app.nodes]);
  const [selectedPosition, setSelectedPosition] = useState(position ?? 0);
  const [entrySearch, setEntrySearch] = useState("");
  const [previousEntryIndex, setPreviousEntryIndex] = useState<number | null>(null);
  const [explanationState, setExplanationState] = useState<"idle" | "copied" | "failed">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloaded" | "failed">("idle");
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const selectedHopRef = useRef<HTMLButtonElement>(null);
  const visibleEntries = useMemo(() => {
    const term = entrySearch.trim().toLowerCase();
    if (!term) return app.entries;
    return app.entries.filter((item) => {
      const nodes = item.hops
        .map((hop) => nodeById.get(hop.node_id))
        .filter(Boolean);
      const haystack = [
          item.label,
          item.description,
          entryContext(item, nodeById),
          ...item.hops.flatMap((hop) => [hop.edge_label, hop.caption]),
          ...nodes.flatMap((node) => node ? [node.label, node.file, node.module, node.scope?.module, node.snippet, node.sourceWindow?.lines.join(" ")] : []),
        ].join(" ").toLowerCase();
      return term.split(/\s+/).every((part) => {
        const [key, ...rest] = part.split(":");
        const value = rest.join(":");
        if (key === "has" && (value === "source" || value === "source-preview")) return nodes.some(hasSource);
        if (key === "has" && (value === "source-gap" || value === "missing-source")) return nodes.some((node) => !hasSource(node));
        return haystack.includes(part);
      });
    });
  }, [app, entrySearch, nodeById]);
  const entryOptions = entry && visibleEntries.includes(entry)
    ? visibleEntries
    : entry
      ? [entry, ...visibleEntries]
      : visibleEntries;
  useEffect(() => {
    setEntrySearch("");
    setPreviousEntryIndex(null);
  }, [app]);
  useEffect(() => {
    if (!entry) return;
    const fallback = entry.hops.findIndex((hop) => hop.node_id === hopId);
    const next = position != null && entry.hops[position]?.node_id === hopId
      ? position
      : fallback;
    setSelectedPosition(next >= 0 ? next : 0);
    setExplanationState("idle");
    setShareState("idle");
  }, [app, entryIndex, hopId, position]);
  useEffect(() => {
    selectedHopRef.current?.scrollIntoView({ block: "nearest" });
  }, [entryIndex, selectedPosition, hopId]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']") || target.closest('[role="dialog"]'))
        return;
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        moveHop(event.key === "]" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, hopId, selectedPosition]);
  if (!entry)
    return (
      <section className="workspace-empty">
        <h2>No request flows in this bundle</h2>
        <p>
          {app.flows.length
            ? "Code paths are still available. Open one to follow its symbols and relationships."
            : "Open the graph to inspect the structure included in this bundle."}
        </p>
        <button
          className="context-upload"
          type="button"
          onClick={() => onView(app.flows.length ? "trace" : "map")}
        >
          <span>{app.flows.length ? "Open code paths" : "Open graph"}</span>
          <span className="button-icon">
            <Icon name="arrow" size={14} />
          </span>
        </button>
      </section>
    );
  const selected = nodeById.get(hopId) ?? app.nodes[0];
  const evidence = app.mcp.find((item) => item.for === entry.id);
  const firstNode = nodeById.get(entry.hops[0]?.node_id ?? "");
  const lastNode = nodeById.get(entry.hops.at(-1)?.node_id ?? "");
  const contextRoute = entryScopes(entry, nodeById);
  const sourcePreviewCount = entry.hops.filter((hop) => {
    const node = nodeById.get(hop.node_id);
    return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
  }).length;
  const items: PathItem[] = entry.hops.map((hop) => ({
    id: hop.node_id,
    occurrenceId: hop.id,
    node: nodeById.get(hop.node_id) ?? app.nodes[0],
    label: hop.edge_label,
    caption: hop.caption,
    relation: hop.edge_label,
  }));
  const selectedIndex = Math.max(
    0,
    items[selectedPosition]?.id === hopId
      ? selectedPosition
      : items.findIndex((item) => item.id === hopId),
  );
  const previousEntry = previousEntryIndex == null ? undefined : app.entries[previousEntryIndex];
  function rememberEntry(nextIndex: number) {
    if (entry && nextIndex !== entryIndex) setPreviousEntryIndex(entryIndex);
  }
  function returnToPreviousEntry() {
    if (!previousEntry) return;
    const currentIndex = entryIndex;
    setPreviousEntryIndex(currentIndex);
    setEntryIndex(previousEntryIndex!);
    setHopId(previousEntry.hops[0]?.node_id ?? "");
    onPositionChange?.(0);
    onInspectorOpen();
    onRecord("Returned to request flow", previousEntry.label, `${previousEntry.hops.length} steps`);
    trackEvent("callpath_reversed");
  }
  function openConnectedEntry(nextIndex: number, nextHopId: string) {
    rememberEntry(nextIndex);
    onEntry(nextIndex, nextHopId);
  }
  function moveHop(delta: number) {
    const next = items[selectedIndex + delta];
    if (!next) return;
    setSelectedPosition(selectedIndex + delta);
    onPositionChange?.(selectedIndex + delta);
    setHopId(next.id);
    onInspectorOpen();
    onRecord(
      "Inspected request step",
      next.node.label || next.node.id,
      nodeLocation(next.node),
    );
    trackEvent("callpath_step_navigated", {
      direction: delta > 0 ? "next" : "previous",
    });
  }
  async function copyExplanation() {
    try {
      await copyText(explainEntry(app, entry, selectedIndex, window.location.href));
      setExplanationState("copied");
      trackEvent("path_explanation_copied", { surface: "journey" });
      window.setTimeout(() => setExplanationState("idle"), 1800);
    } catch {
      setExplanationState("failed");
      trackEvent("path_explanation_copy_failed", { surface: "journey" });
    }
  }
  async function shareEntry() {
    if (!onShare) return;
    const params: Record<string, string> = {
      view: "journey",
      entry: entry.id,
      hop: hopId,
      hop_index: String(selectedIndex),
    };
    const occurrence = items[selectedIndex]?.occurrenceId;
    if (occurrence) params.hop_occurrence = occurrence;
    const copied = await onShare(params);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  function downloadExplanation() {
    try {
      const filename = `${(entry.label || "lachesis-request-flow").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "lachesis-request-flow"}.md`;
      downloadText(explainEntry(app, entry, selectedIndex, window.location.href), filename);
      setDownloadState("downloaded");
      trackEvent("path_explanation_downloaded", { surface: "journey" });
      window.setTimeout(() => setDownloadState("idle"), 1800);
    } catch {
      setDownloadState("failed");
      trackEvent("path_explanation_download_failed", { surface: "journey" });
    }
  }
  return (
    <section className={`workspace${inspectorOpen ? "" : " inspector-closed"}`}>
      <aside className="journey-rail">
        <label className="panel-label" htmlFor="entrypoint-select">
          STARTING POINT
        </label>
        <label className="search entry-search">
          <Icon name="search" size={14} />
          <input
            value={entrySearch}
            onChange={(event) => setEntrySearch(event.target.value)}
            placeholder="Find a request flow…"
            aria-label="Filter request flows by starting point, symbol, file, or description"
          />
          {entrySearch && <button type="button" onClick={() => setEntrySearch("")} aria-label="Clear request flow filter">×</button>}
        </label>
        <div className="entry-search-status" aria-live="polite">
          {entrySearch ? `${visibleEntries.length} of ${app.entries.length} request flows match` : `${app.entries.length} request flow${app.entries.length === 1 ? "" : "s"}`}
        </div>
        {(app.entries.some((item) => item.hops.some((hop) => hasSource(nodeById.get(hop.node_id)))) || app.entries.some((item) => item.hops.some((hop) => !hasSource(nodeById.get(hop.node_id))))) && (
          <div className="filter-hints" role="group" aria-label="Quick request flow filters">
            {app.entries.some((item) => item.hops.some((hop) => hasSource(nodeById.get(hop.node_id)))) && <button type="button" onClick={() => setEntrySearch("has:source")}>Has source</button>}
            {app.entries.some((item) => item.hops.some((hop) => !hasSource(nodeById.get(hop.node_id)))) && <button type="button" onClick={() => setEntrySearch("has:source-gap")}>Source gaps</button>}
            {entrySearch && <button type="button" className="query-clear" onClick={() => setEntrySearch("")}>Clear</button>}
          </div>
        )}
        {entrySearch && !visibleEntries.length && (
          <div className="selector-empty" role="status">
            <span>No request flows match “{entrySearch}”.</span>
            <button type="button" onClick={() => setEntrySearch("")}>Clear filter</button>
          </div>
        )}
        <select
          id="entrypoint-select"
          className="entry-select"
          value={entryIndex}
          onChange={(event) => {
            const next = Number(event.target.value);
            const selectedEntry = app.entries[next];
            const matchingHop = selectedEntry
              ? matchingHopIndex(selectedEntry, entrySearch, nodeById)
              : -1;
            const nextPosition = matchingHop >= 0 ? matchingHop : 0;
            rememberEntry(next);
            setEntryIndex(next);
            setHopId(selectedEntry?.hops[nextPosition]?.node_id ?? "");
            onPositionChange?.(nextPosition);
            onInspectorOpen();
            if (selectedEntry)
              onRecord(
                "Opened request flow",
                selectedEntry.label,
                `${selectedEntry.hops.length} steps`,
              );
            trackEvent("callpath_selected");
          }}
        >
          {entryOptions.map((item) => {
            const index = app.entries.indexOf(item);
            return (
              <option value={index} key={item.id}>
                {item.label}{entryContext(item, nodeById) ? ` · ${entryContext(item, nodeById)}` : ""} · {item.hops.length} steps
              </option>
            );
          })}
        </select>
        <div className="panel-label hops-label">
          PATH STEPS <span>{entry.hops.length}</span>
        </div>
        <div className="hop-list">
          {entry.hops.map((hop, index) => {
            const rowNode = nodeById.get(hop.node_id);
            return (
            <button
              type="button"
              key={`${index}-${hop.node_id}`}
              ref={selectedIndex === index ? selectedHopRef : undefined}
              className={selectedIndex === index ? "hop-row selected" : "hop-row"}
              onClick={() => {
                const node = nodeById.get(hop.node_id);
                setSelectedPosition(index);
                onPositionChange?.(index);
                setHopId(hop.node_id);
                onInspectorOpen();
                if (node)
                  onRecord(
                    "Inspected request node",
                    node.label || node.id,
                    `${hop.edge_label} · ${nodeLocation(node)}`,
                  );
                trackEvent("callpath_hop_selected");
              }}
            >
              <span className="hop-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <b>{hop.edge_label}</b>
                <small>{hop.caption || "Relationship not reported"}</small>
                <small className="node-row-context">
                  {nodeContext(rowNode) ? `${nodeContext(rowNode)} · ` : ""}{rowNode?.file || "Source unavailable"}:{rowNode?.line || "—"}
                </small>
                <small className="node-row-context">
                  {hasSource(rowNode) ? "Source preview included" : "Source text unavailable"}
                </small>
              </span>
            </button>
            );
          })}
        </div>
      </aside>
      <main className="main-panel">
        <div className="toolbar">
          <div>
            <span className="panel-label">SELECTED REQUEST</span>
            <h2>{entry.label}</h2>
            {entry.description && <p className="path-description">{entry.description}</p>}
            <p className="path-meta">
              {entry.confidence && <span>{entry.confidence} confidence</span>}
              <span>{sourcePreviewCount} / {entry.hops.length} source previews</span>
              {entry.limitations?.length ? <span>{entry.limitations.length} known limitation{entry.limitations.length === 1 ? "" : "s"}</span> : null}
              {contextRoute.length > 1 && <span>context: {contextRoute.join(" → ")}</span>}
            </p>
          </div>
          <div className="toolbar-actions">
            {previousEntry && (
              <button type="button" className="inspector-reopen selection-back" onClick={returnToPreviousEntry} title={`Return to ${previousEntry.label}`}>
                ← Back to previous flow
              </button>
            )}
            {!inspectorOpen && (
              <button className="inspector-reopen" type="button" onClick={onInspectorOpen} aria-expanded={inspectorOpen} aria-controls="source-inspector">
                Show source
              </button>
            )}
            <button className="inspector-reopen" type="button" onClick={() => onView("map", hopId)}>
              Open in Explore
            </button>
            <div className="toolbar-share-actions" role="group" aria-label="Share this request context">
              <button className="inspector-reopen share-explanation" type="button" onClick={copyExplanation} aria-live="polite">
                {explanationState === "copied" ? "Markdown copied" : explanationState === "failed" ? "Copy failed" : "Copy Markdown"}
              </button>
              <button className="inspector-reopen share-explanation" type="button" onClick={downloadExplanation} aria-live="polite">
                {downloadState === "downloaded" ? "Markdown saved" : downloadState === "failed" ? "Download failed" : "Download .md"}
              </button>
              {onShare && (
                <button className="inspector-reopen" type="button" onClick={shareEntry} aria-live="polite">
                  {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
                </button>
              )}
            </div>
            <div className="step-nav" role="group" aria-label="Request flow step navigation">
              <button
                className="inspector-reopen"
                type="button"
                disabled={selectedIndex === 0}
                aria-keyshortcuts="["
                onClick={() => moveHop(-1)}
              >
                Previous
              </button>
              <button
                className="inspector-reopen"
                type="button"
                disabled={selectedIndex >= items.length - 1}
                aria-keyshortcuts="]"
                onClick={() => moveHop(1)}
              >
                Next
              </button>
              <span className="step-nav-hint" aria-label="Use left bracket and right bracket to navigate steps">
                <kbd>[</kbd><kbd>]</kbd>
              </span>
            </div>
            <span
              className={`layout-source ${entry.hasLayout ? "precomputed" : "derived"}`}
            >
              <i />
              {entry.hasLayout ? "Bundle layout" : "Derived layout"}
            </span>
          </div>
        </div>
        <div
          className="trace-orientation"
          aria-label="Selected request flow summary"
        >
          <div>
            <span>STARTING POINT</span>
            <b>{firstNode?.label || entry.label}</b>
            <small>
              {nodeLocation(firstNode)}
            </small>
          </div>
          <i aria-hidden="true">
            <span />
          </i>
          <div>
            <span>LAST OBSERVED STEP</span>
            <b>{lastNode?.label || "Unknown symbol"}</b>
            <small>
              {nodeLocation(lastNode)}
            </small>
          </div>
          <div className="trace-orientation-fact">
            <span>STEP / TOTAL</span>
            <b>
              {selectedIndex + 1} / {items.length}
            </b>
          </div>
          <div className="trace-orientation-fact">
            <span>LAYOUT</span>
            <b>{entry.hasLayout ? "exact" : "derived"}</b>
          </div>
        </div>
        <PathCanvas
          items={items}
          title="Request flow"
          selectedId={hopId}
          selectedIndex={selectedIndex}
          onSelect={(id, index) => {
            const node = nodeById.get(id);
            setSelectedPosition(index);
            onPositionChange?.(index);
            setHopId(id);
            onInspectorOpen();
            if (node)
              onRecord(
                "Inspected request node",
                node.label || node.id,
                nodeLocation(node),
              );
            trackEvent("callpath_hop_selected");
          }}
          points={entry.hops.map((hop) => hop.layout)}
          layoutSource={entry.hasLayout ? "precomputed" : "derived"}
        />
        <EvidencePanel
          evidence={evidence}
          fallbackTool="journey"
          fallbackArgs={entry.label}
          fallbackSummary={`${entry.hops.length} visible steps from the selected starting point.`}
          nodeCount={entry.hops.length}
          variant="path"
        />
      </main>
      {inspectorOpen && (
        <NodeInspector
          node={selected}
          contextRole={items[selectedIndex]?.label}
          contextNote={items[selectedIndex]?.caption}
          contextOccurrence={items[selectedIndex]?.occurrenceId}
          app={app}
          onNode={(nextNodeId) => {
            const nextIndex = items.findIndex((item) => item.id === nextNodeId);
            if (nextIndex >= 0) {
              setSelectedPosition(nextIndex);
              onPositionChange?.(nextIndex);
              setHopId(nextNodeId);
              onInspectorOpen();
              onRecord("Inspected nearby symbol", nodeById.get(nextNodeId)?.label || nextNodeId, nodeLocation(nodeById.get(nextNodeId)));
              trackEvent("journey_nearby_node_selected");
              return;
            }
            onView("map", nextNodeId);
          }}
          onFile={onFile}
          onFlow={onFlow}
          onEntry={openConnectedEntry}
          onClose={onInspectorClose}
        />
      )}
    </section>
  );
}
