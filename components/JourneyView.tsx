"use client";
import { useEffect, useRef, useState } from "react";
import type { App } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { Icon } from "./Icon";
import { PathCanvas, type PathItem } from "./PathCanvas";
import { NodeInspector } from "./NodeInspector";
import { EvidencePanel } from "./EvidencePanel";
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
  onView: (view: "trace" | "map") => void;
  onShare: (position: number) => Promise<boolean>;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (entryIndex: number, nodeId: string) => void;
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
  onShare,
  onFlow,
  onEntry,
}: Props) {
  const entry = app.entries[entryIndex] ?? app.entries[0];
  const [selectedPosition, setSelectedPosition] = useState(position ?? 0);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const selectedHopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!entry) return;
    const fallback = entry.hops.findIndex((hop) => hop.node_id === hopId);
    const next = position != null && entry.hops[position]?.node_id === hopId
      ? position
      : fallback;
    setSelectedPosition(next >= 0 ? next : 0);
  }, [app, entryIndex, position]);
  useEffect(() => {
    selectedHopRef.current?.scrollIntoView({ block: "nearest" });
  }, [entryIndex, selectedPosition, hopId]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        moveHop(event.key === "]" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, hopId]);
  if (!entry)
    return (
      <section className="workspace-empty">
        <h2>No request paths in this bundle</h2>
        <p>
          {app.flows.length
            ? "Graph paths are still available. Open one to follow its symbols and relationships."
            : "Open the system map to inspect the graph structure included in this bundle."}
        </p>
        <button
          className="context-upload"
          type="button"
          onClick={() => onView(app.flows.length ? "trace" : "map")}
        >
          <span>{app.flows.length ? "Open graph paths" : "Open system map"}</span>
          <span className="button-icon">
            <Icon name="arrow" size={14} />
          </span>
        </button>
      </section>
    );
  const selected = app.nodes.find((node) => node.id === hopId) ?? app.nodes[0];
  const evidence = app.mcp.find((item) => item.for === entry.id);
  const firstNode = app.nodes.find(
    (node) => node.id === entry.hops[0]?.node_id,
  );
  const lastNode = app.nodes.find(
    (node) => node.id === entry.hops.at(-1)?.node_id,
  );
  const items: PathItem[] = entry.hops.map((hop) => ({
    id: hop.node_id,
    occurrenceId: hop.id,
    node: app.nodes.find((node) => node.id === hop.node_id) ?? app.nodes[0],
    label: hop.edge_label,
    caption: hop.caption,
  }));
  const selectedIndex = Math.max(
    0,
    items[selectedPosition]?.id === hopId
      ? selectedPosition
      : items.findIndex((item) => item.id === hopId),
  );
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
      `${next.node.file}:${next.node.line}`,
    );
    trackEvent("callpath_step_navigated", {
      direction: delta > 0 ? "next" : "previous",
    });
  }
  async function sharePath() {
    const copied = await onShare(selectedIndex);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  return (
    <section className={`workspace${inspectorOpen ? "" : " inspector-closed"}`}>
      <aside className="journey-rail">
        <label className="panel-label" htmlFor="entrypoint-select">
          ENTRYPOINT
        </label>
        <select
          id="entrypoint-select"
          className="entry-select"
          value={entryIndex}
          onChange={(event) => {
            const next = Number(event.target.value);
            const selectedEntry = app.entries[next];
            setEntryIndex(next);
            setHopId(selectedEntry?.hops[0]?.node_id ?? "");
            onPositionChange?.(0);
            onInspectorOpen();
            if (selectedEntry)
              onRecord(
                "Opened request path",
                selectedEntry.label,
                `${selectedEntry.hops.length} hops`,
              );
            trackEvent("callpath_selected");
          }}
        >
          {app.entries.map((item, index) => (
            <option value={index} key={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="panel-label hops-label">
          PATH NODES <span>{entry.hops.length}</span>
        </div>
        <div className="hop-list">
          {entry.hops.map((hop, index) => (
            <button
              key={`${index}-${hop.node_id}`}
              ref={selectedIndex === index ? selectedHopRef : undefined}
              className={selectedIndex === index ? "hop-row selected" : "hop-row"}
              onClick={() => {
                const node = app.nodes.find((item) => item.id === hop.node_id);
                setSelectedPosition(index);
                onPositionChange?.(index);
                setHopId(hop.node_id);
                onInspectorOpen();
                if (node)
                  onRecord(
                    "Inspected request node",
                    node.label || node.id,
                    `${hop.edge_label} · ${node.file}:${node.line}`,
                  );
                trackEvent("callpath_hop_selected");
              }}
            >
              <span className="hop-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <b>{hop.edge_label}</b>
                <small>{hop.caption}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="main-panel">
        <div className="toolbar">
          <div>
            <span className="panel-label">SELECTED REQUEST</span>
            <h2>{entry.label}</h2>
            {entry.description && <p className="path-description">{entry.description}</p>}
            {(entry.confidence || entry.limitations?.length) && (
              <p className="path-meta">
                {entry.confidence && <span>{entry.confidence} confidence</span>}
                {entry.limitations?.length ? <span>{entry.limitations.length} known limitation{entry.limitations.length === 1 ? "" : "s"}</span> : null}
              </p>
            )}
          </div>
          <div className="toolbar-actions">
            {!inspectorOpen && (
              <button className="inspector-reopen" onClick={onInspectorOpen}>
                Show source
              </button>
            )}
            <button className="inspector-reopen" type="button" onClick={sharePath} aria-live="polite">
              {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
            </button>
            <div className="step-nav" aria-label="Request path step navigation">
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
              <span className="step-nav-hint" aria-label="Use left bracket and right bracket to navigate hops">
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
          aria-label="Selected request path summary"
        >
          <div>
            <span>ENTRYPOINT</span>
            <b>{firstNode?.label || entry.label}</b>
            <small>
              {firstNode?.file}:{firstNode?.line}
            </small>
          </div>
          <i aria-hidden="true">
            <span />
          </i>
          <div>
            <span>LAST OBSERVED HOP</span>
            <b>{lastNode?.label || "Unknown symbol"}</b>
            <small>
              {lastNode?.file}:{lastNode?.line}
            </small>
          </div>
          <div className="trace-orientation-fact">
            <span>HOP / TOTAL</span>
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
          selectedId={hopId}
          selectedIndex={selectedIndex}
          onSelect={(id, index) => {
            const node = app.nodes.find((item) => item.id === id);
            setSelectedPosition(index);
            onPositionChange?.(index);
            setHopId(id);
            onInspectorOpen();
            if (node)
              onRecord(
                "Inspected request node",
                node.label || node.id,
                `${node.file}:${node.line}`,
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
          fallbackSummary={`${entry.hops.length} visible hops from the selected entrypoint.`}
          nodeCount={entry.hops.length}
        />
      </main>
      {inspectorOpen && (
        <NodeInspector
          node={selected}
          app={app}
          onFlow={onFlow}
          onEntry={onEntry}
          onClose={onInspectorClose}
        />
      )}
    </section>
  );
}
